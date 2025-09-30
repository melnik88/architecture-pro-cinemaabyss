const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');

const app = express();
const PORT = process.env.PORT || 8082;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

// Middleware
app.use(express.json());

// Kafka setup
const kafka = new Kafka({
  clientId: 'events-service',
  brokers: KAFKA_BROKERS.split(','),
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'events-service-group' });

// Kafka topics
const TOPICS = {
  MOVIE_EVENTS: 'movie-events',
  USER_EVENTS: 'user-events',
  PAYMENT_EVENTS: 'payment-events'
};

// Initialize Kafka with retry logic
async function initKafka(retries = 10, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connecting to Kafka... (attempt ${i + 1}/${retries})`);
      await producer.connect();
      await consumer.connect();

      // Subscribe to all topics to consume events
      await consumer.subscribe({ topics: Object.values(TOPICS) });

      // Start consuming messages
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const eventData = JSON.parse(message.value.toString());
          console.log(`[KAFKA CONSUMER] Received event from topic ${topic}:`, {
            partition,
            offset: message.offset,
            timestamp: message.timestamp,
            data: eventData
          });

          // Process the event (log it for MVP)
          processEvent(topic, eventData, partition, message.offset);
        },
      });

      console.log('Kafka connected successfully');
      return;
    } catch (error) {
      console.error(`Failed to connect to Kafka (attempt ${i + 1}/${retries}):`, error.message);

      if (i === retries - 1) {
        console.error('Max retries reached. Exiting...');
        process.exit(1);
      }

      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Process events (for MVP, just log them)
function processEvent(topic, eventData, partition, offset) {
  const timestamp = new Date().toISOString();
  console.log(`[EVENT PROCESSOR] ${timestamp} - Processing event from ${topic}:`, {
    partition,
    offset,
    event: eventData
  });

  // Here you could add more complex event processing logic
  // For MVP, we just log the events
}

// Utility function to send event to Kafka
async function sendEventToKafka(topic, eventData) {
  try {
    const result = await producer.send({
      topic,
      messages: [
        {
          key: eventData.id || uuidv4(),
          value: JSON.stringify(eventData),
          timestamp: Date.now()
        }
      ]
    });

    console.log(`[KAFKA PRODUCER] Event sent to topic ${topic}:`, result);
    return result[0]; // Return first result
  } catch (error) {
    console.error(`[KAFKA PRODUCER] Failed to send event to topic ${topic}:`, error);
    throw error;
  }
}

// Health check endpoint
app.get('/api/events/health', (req, res) => {
  res.json({ status: true });
});

// Movie events endpoint
app.post('/api/events/movie', async (req, res) => {
  try {
    const { movie_id, title, action, user_id, rating, genres, description } = req.body;

    // Validate required fields
    if (!movie_id || !title || !action) {
      return res.status(400).json({
        error: 'Missing required fields: movie_id, title, action'
      });
    }

    // Create event object
    const event = {
      id: `movie-${movie_id}-${action}-${uuidv4()}`,
      type: 'movie',
      timestamp: new Date().toISOString(),
      payload: {
        movie_id: parseInt(movie_id),
        title,
        action,
        user_id: user_id ? parseInt(user_id) : undefined,
        rating: rating ? parseFloat(rating) : undefined,
        genres: genres || undefined,
        description: description || undefined
      }
    };

    // Send to Kafka
    const result = await sendEventToKafka(TOPICS.MOVIE_EVENTS, event);

    // Return response according to API spec
    res.status(201).json({
      status: 'success',
      partition: result.partition,
      offset: parseInt(result.baseOffset),
      event
    });

  } catch (error) {
    console.error('Error creating movie event:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// User events endpoint
app.post('/api/events/user', async (req, res) => {
  try {
    const { user_id, username, email, action, timestamp } = req.body;

    // Validate required fields
    if (!user_id || !action || !timestamp) {
      return res.status(400).json({
        error: 'Missing required fields: user_id, action, timestamp'
      });
    }

    // Create event object
    const event = {
      id: `user-${user_id}-${action}-${uuidv4()}`,
      type: 'user',
      timestamp: timestamp || new Date().toISOString(),
      payload: {
        user_id: parseInt(user_id),
        username: username || undefined,
        email: email || undefined,
        action,
        timestamp
      }
    };

    // Send to Kafka
    const result = await sendEventToKafka(TOPICS.USER_EVENTS, event);

    // Return response according to API spec
    res.status(201).json({
      status: 'success',
      partition: result.partition,
      offset: parseInt(result.baseOffset),
      event
    });

  } catch (error) {
    console.error('Error creating user event:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Payment events endpoint
app.post('/api/events/payment', async (req, res) => {
  try {
    const { payment_id, user_id, amount, status, timestamp, method_type } = req.body;

    // Validate required fields
    if (!payment_id || !user_id || !amount || !status || !timestamp) {
      return res.status(400).json({
        error: 'Missing required fields: payment_id, user_id, amount, status, timestamp'
      });
    }

    // Create event object
    const event = {
      id: `payment-${payment_id}-${status}-${uuidv4()}`,
      type: 'payment',
      timestamp: timestamp || new Date().toISOString(),
      payload: {
        payment_id: parseInt(payment_id),
        user_id: parseInt(user_id),
        amount: parseFloat(amount),
        status,
        timestamp,
        method_type: method_type || undefined
      }
    };

    // Send to Kafka
    const result = await sendEventToKafka(TOPICS.PAYMENT_EVENTS, event);

    // Return response according to API spec
    res.status(201).json({
      status: 'success',
      partition: result.partition,
      offset: parseInt(result.baseOffset),
      event
    });

  } catch (error) {
    console.error('Error creating payment event:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    await consumer.disconnect();
    await producer.disconnect();
    console.log('Kafka connections closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
async function startServer() {
  try {
    await initKafka();

    app.listen(PORT, () => {
      console.log(`Events service running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/events/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
