# ManKahi Kubernetes Infrastructure

This directory contains the Kubernetes configurations for deploying the ManKahi blogging platform infrastructure.

## Architecture

The platform is built using a microservices architecture with the following components:

- **Auth Service**: Handles user authentication and authorization
- **Blog Service**: Manages blog posts and content
- **Analytics Service**: Tracks and processes analytics data
- **Admin Service**: Provides administrative functionalities

Supporting infrastructure:
- PostgreSQL for primary database
- Redis for caching and session management
- Elasticsearch for full-text search
- Prometheus and Grafana for monitoring

## Prerequisites

- Kubernetes cluster (v1.22+)
- kubectl
- kustomize
- Helm (for optional components)

## Directory Structure

```
k8s/
├── base/                    # Base Kubernetes configurations
│   ├── config.yaml         # ConfigMaps for services
│   ├── infrastructure.yaml # Core infrastructure components
│   ├── ingress.yaml       # Ingress configurations
│   ├── monitoring.yaml    # Prometheus and Grafana setup
│   ├── namespace.yaml     # Namespace definition
│   ├── services.yaml     # Microservices deployments
│   ├── storage.yaml      # Persistent volume claims
│   └── secrets/          # Secret templates
├── overlays/              # Environment-specific configurations
│   ├── development/      # Development environment
│   └── production/       # Production environment
```

## Setup Instructions

1. **Initialize Secrets**
   ```bash
   # Copy secret templates
   cp k8s/base/secrets/postgres.env.example k8s/base/secrets/postgres.env
   cp k8s/base/secrets/services.env.example k8s/base/secrets/services.env
   
   # Edit the secret files with your values
   nano k8s/base/secrets/postgres.env
   nano k8s/base/secrets/services.env
   ```

2. **Deploy Development Environment**
   ```bash
   ./scripts/deploy.sh -e development -a apply
   ```

3. **Deploy Production Environment**
   ```bash
   ./scripts/deploy.sh -e production -a apply
   ```

## Monitoring

The platform includes comprehensive monitoring using Prometheus and Grafana:

1. **Access Monitoring Dashboard**
   - Development: http://monitoring.mankahi.local/grafana
   - Production: https://monitoring.yourdomain.com/grafana

2. **View Service Metrics**
   ```bash
   ./scripts/monitor.sh -c metrics
   ```

3. **Check Service Health**
   ```bash
   ./scripts/monitor.sh -c health
   ```

## Scaling

The production environment is configured for high availability:

- Blog Service: 5 replicas
- Auth Service: 3 replicas
- Analytics Service: 3 replicas
- Redis: 3 replicas
- Elasticsearch: 3 replicas

To modify scaling:
1. Edit the respective overlay kustomization file
2. Redeploy using the deploy script

## Troubleshooting

1. **View Service Logs**
   ```bash
   ./scripts/monitor.sh -c logs -s service-name
   ```

2. **Check Resource Usage**
   ```bash
   ./scripts/monitor.sh -c resources
   ```

3. **View Pod Status**
   ```bash
   ./scripts/monitor.sh -c pods
   ```

## Backup and Restore

1. PostgreSQL backups are handled through CronJobs and stored in a separate persistent volume
2. Elasticsearch snapshots are configured to run daily
3. All persistent volumes should be backed up according to your cloud provider's recommendations

## Security Notes

1. Always change default passwords in the secrets files
2. Keep secrets files out of version control
3. Enable network policies in production
4. Use TLS for all services in production
5. Regularly update container images and dependencies

## Resource Requirements

Minimum cluster requirements for production:
- 16 CPU cores
- 32GB RAM
- 500GB storage

Development environment can run with reduced resources:
- 4 CPU cores
- 8GB RAM
- 50GB storage
