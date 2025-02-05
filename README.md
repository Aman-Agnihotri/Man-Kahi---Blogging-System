# Man Kahi - Blogging System

A modern blogging platform built with microservices architecture.

## System Architecture

The system consists of the following services:
- Auth Service: User authentication and authorization
- Blog Service: Blog post management and content delivery
- Analytics Service: User behavior and content analytics
- Admin Service: Administrative operations and monitoring
- Frontend: Nuxt.js-based user interface

Supporting infrastructure:
- PostgreSQL: Primary database
- Redis: Session management and caching
- Elasticsearch: Full-text search
- MinIO: Object storage
- Nginx: API Gateway

## Prerequisites

- Docker and Docker Compose
- Kubernetes cluster (for K8s deployment)
- kubectl
- kustomize

## Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd man-kahi
```

2. Set up environment variables:
```bash
cp .env.example .env.development
# Edit .env.development with your development settings
```

3. Start the services using Docker Compose:
```bash
cd docker/compose
docker-compose up -d
```

4. Initialize the databases:
```bash
# Wait for PostgreSQL to be ready
docker-compose exec postgres bash /docker-entrypoint-initdb.d/init-multiple-dbs.sh
```

5. Access the services:
- Frontend: http://localhost:3000
- API Gateway: http://localhost:80
- Admin Dashboard: http://localhost:3004
- MinIO Console: http://localhost:9001

## Kubernetes Deployment

### Development Environment

1. Create required secrets:
```bash
cd kubernetes/environments/development
cp secrets.example.yaml secrets.yaml
# Edit secrets.yaml with your development secrets
```

2. Apply the development configuration:
```bash
kubectl apply -k kubernetes/environments/development
```

### Production Environment

1. Set up production secrets:
```bash
cd kubernetes/environments/production
cp secrets.example.yaml secrets.yaml
# Edit secrets.yaml with your production secrets
```

2. Update the domain in app-config.yaml:
```yaml
FRONTEND_URL: "https://your-domain.com"
CORS_ORIGIN: "https://your-domain.com"
```

3. Apply the production configuration:
```bash
kubectl apply -k kubernetes/environments/production
```

## Service URLs

Development URLs:
- Frontend: http://localhost:3000
- Auth Service: http://localhost:3001
- Blog Service: http://localhost:3002
- Analytics Service: http://localhost:3003
- Admin Service: http://localhost:3004

Kubernetes URLs:
- Development: http://mankahi.local
- Production: https://your-domain.com

## Environment Variables

The system uses two environment files:
- `.env`: Base configuration shared between environments
- `.env.development`: Development-specific overrides

For production, use Kubernetes secrets and ConfigMaps located in:
- `kubernetes/environments/production/app-config.yaml`
- `kubernetes/environments/production/secrets.yaml`

## Health Checks

Monitor service health:
```bash
# Docker Compose
docker-compose ps

# Kubernetes
kubectl get pods -n mankahi
```

## Logs

View service logs:
```bash
# Docker Compose
docker-compose logs -f [service-name]

# Kubernetes
kubectl logs -f -n mankahi deployment/[service-name]
```

## Data Persistence

Volumes are used for:
- PostgreSQL data
- Redis data
- Elasticsearch data
- MinIO storage
- Blog uploads
- Service logs

## Security Notes

1. Development environment:
   - Default credentials in .env.development
   - Services exposed on localhost
   - Debug logging enabled
   - CORS configured for local development

2. Production environment:
   - Use strong, unique secrets
   - Services not directly exposed
   - Minimal logging
   - CORS restricted to your domain
   - Health checks enabled
   - Resource limits enforced

## Troubleshooting

1. Database Connection Issues:
   - Verify PostgreSQL is healthy: `docker-compose ps postgres`
   - Check database initialization: `docker-compose logs postgres`

2. Service Startup Issues:
   - Verify dependencies are healthy
   - Check service logs: `docker-compose logs [service-name]`
   - Verify environment variables are set correctly

3. Kubernetes Issues:
   - Check pod status: `kubectl get pods -n mankahi`
   - View pod logs: `kubectl logs -n mankahi [pod-name]`
   - Verify secrets: `kubectl get secrets -n mankahi`

## Development Workflow

1. Local Development:
```bash
# Start all services
docker-compose up -d

# Watch service logs
docker-compose logs -f

# Rebuild a specific service
docker-compose up -d --build [service-name]
```

2. Kubernetes Development:
```bash
# Apply changes
kubectl apply -k kubernetes/environments/development

# Watch pods
kubectl get pods -n mankahi -w

# View logs
kubectl logs -f -n mankahi deployment/[service-name]
