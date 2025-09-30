const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8000;

// Configuration from environment variables
const config = {
  monolithUrl: process.env.MONOLITH_URL || 'http://localhost:8080',
  moviesServiceUrl: process.env.MOVIES_SERVICE_URL || 'http://localhost:8081',
  eventsServiceUrl: process.env.EVENTS_SERVICE_URL || 'http://localhost:8082',
  gradualMigration: process.env.GRADUAL_MIGRATION === 'true',
  moviesMigrationPercent: parseInt(process.env.MOVIES_MIGRATION_PERCENT || '0', 10)
};

console.log('Proxy Service Configuration:', config);

// Basic middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: true,
    service: 'proxy-service',
    timestamp: new Date().toISOString(),
    config: {
      gradualMigration: config.gradualMigration,
      moviesMigrationPercent: config.moviesMigrationPercent
    }
  });
});

// Strangler Fig Pattern Implementation
function shouldRouteToMicroservice(migrationPercent) {
  if (!config.gradualMigration) {
    return migrationPercent === 100;
  }

  // Generate random number between 0-99
  const randomPercent = Math.floor(Math.random() * 100);
  return randomPercent < migrationPercent;
}

// Movies health check - always route to microservice
app.use('/api/movies/health', createProxyMiddleware({
  target: config.moviesServiceUrl,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error(`Movies service health check error:`, err.message);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Movies service temporarily unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying movies health check ${req.method} ${req.url} to ${config.moviesServiceUrl}`);
  }
}));

// Movies routing with Strangler Fig pattern
app.use('/api/movies', (req, res, next) => {
  const routeToMicroservice = shouldRouteToMicroservice(config.moviesMigrationPercent);

  console.log(`Movies request: ${req.method} ${req.path} -> ${routeToMicroservice ? 'Microservice' : 'Monolith'}`);

  const targetUrl = routeToMicroservice ? config.moviesServiceUrl : config.monolithUrl;

  const proxy = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: routeToMicroservice ? {} : undefined, // Keep path for microservice, no rewrite needed
    onError: (err, req, res) => {
      console.error(`Proxy error for ${targetUrl}:`, err.message);
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Service temporarily unavailable',
        target: routeToMicroservice ? 'microservice' : 'monolith'
      });
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`Proxying ${req.method} ${req.url} to ${targetUrl} with body ${req.body}`);
      if (req.body && Object.keys(req.body).length) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
        proxyReq.end();
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`Response from ${targetUrl}: ${proxyRes.statusCode}`);
    }
  });

  proxy(req, res, next);
});

// Events routing - always route to events microservice if available
app.use('/api/events', createProxyMiddleware({
  target: config.eventsServiceUrl,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error(`Events service error:`, err.message);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Events service temporarily unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying events ${req.method} ${req.url} to ${config.eventsServiceUrl}`);
    if (req.body && Object.keys(req.body).length) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
  }
}));

// All other API routes go to monolith
app.use('/api', createProxyMiddleware({
  target: config.monolithUrl,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error(`Monolith error:`, err.message);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Monolith service temporarily unavailable'
    });
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying ${req.method} ${req.url} to monolith: ${config.monolithUrl}, body: ${req.body}`);
    if (req.body && Object.keys(req.body).length) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
  }
}));

// Catch-all for non-API routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Proxy Service (API Gateway) running on port ${PORT}`);
  console.log(`📊 Gradual Migration: ${config.gradualMigration ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🎬 Movies Migration: ${config.moviesMigrationPercent}% to microservice`);
  console.log(`🔗 Monolith URL: ${config.monolithUrl}`);
  console.log(`🎥 Movies Service URL: ${config.moviesServiceUrl}`);
  console.log(`📡 Events Service URL: ${config.eventsServiceUrl}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
