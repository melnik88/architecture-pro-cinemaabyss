# Руководство по развертыванию CinemaAbyss с помощью Helm

## Обзор
Данное руководство описывает команды для развертывания приложения CinemaAbyss с использованием Helm чартов.

## Предварительные требования
- Kubernetes кластер (colima/minikube)
- Helm 3.x
- kubectl

## Команды развертывания

### 1. Установка Helm (если не установлен)
```bash
brew install helm
```

### 2. Очистка предыдущего развертывания (если необходимо)
```bash
kubectl delete all --all -n cinemaabyss
kubectl delete namespace cinemaabyss
```

### 3. Установка Helm чарта
```bash
helm install cinemaabyss ./src/kubernetes/helm --namespace cinemaabyss --create-namespace
```

### 4. Проверка статуса развертывания
```bash
# Проверка helm релиза
helm list -n cinemaabyss

# Проверка подов
kubectl get pods -n cinemaabyss

# Проверка всех ресурсов
kubectl get all -n cinemaabyss
```

### 5. Тестирование API

#### 5.1 Port-forward для доступа к API
```bash
kubectl port-forward svc/proxy-service 8080:8083 -n cinemaabyss &
```

#### 5.2 Тестирование API endpoint
```bash
curl http://localhost:8080/api/movies
```

Или через браузер: `http://localhost:8080/api/movies`

## Результат развертывания

### Статус Helm релиза:
```
NAME       	NAMESPACE  	REVISION	STATUS  	CHART            	APP VERSION
cinemaabyss	cinemaabyss	1       	deployed	cinemaabyss-0.1.0	1.0.0
```

### Статус подов:
```
NAME                              READY   STATUS    RESTARTS   AGE
events-service-7c7cfcdf57-g9qvh   1/1     Running   0          2m55s
proxy-service-8dd8d4786-vlrmt     1/1     Running   0          2m55s
monolith-cb687d48c-z7rqh          1/1     Running   2          2m55s
movies-service-585bdb7768-9z6k6   1/1     Running   2          2m55s
postgres-0                        1/1     Running   0          2m55s
zookeeper-0                       1/1     Running   0          2m55s
```

### API Response:
```json
[
  {
    "id": 1,
    "title": "The Shawshank Redemption",
    "description": "Two imprisoned men bond over a number of years...",
    "genres": ["Drama"],
    "rating": 9.3
  },
  {
    "id": 2,
    "title": "The Godfather",
    "description": "The aging patriarch of an organized crime dynasty...",
    "genres": ["Crime", "Drama"],
    "rating": 9.2
  }
]
```
