# ManKahi - Blogging System

A scalable, microservices-based blogging platform built with Node.js, TypeScript, and modern cloud-native technologies.

## Architecture

The system is built using a microservices architecture with the following components:

- **Auth Service**: Handles user authentication, roles, and OAuth
- **Blog Service**: Manages blog content, categories, and tags
- **Analytics Service**: Tracks user engagement and content performance
- **Admin Service**: Provides administrative controls and dashboard
- **Frontend**: Server-side rendered Nuxt.js application

## Technology Stack

- **Backend**: Node.js + TypeScript
- **Frontend**: Nuxt.js (SSR)
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Search**: Elasticsearch
- **Storage**: MinIO (S3-compatible)
- **Gateway**: Nginx
- **Containerization**: Docker + Docker Compose

## Pre-Deployment Checklist

### 1. Environment Configuration

Each service requires proper environment variables to be set in production. Create `.env` files based on `.env.example` files:

```bash
# For each service (auth, blog, analytics, admin):
cp backend/{service}/.env.example backend/{service}/.env
```

Important variables to configure:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- OAuth credentials
- Rate limiting settings

### 2. Security Configuration

1. **Nginx SSL/TLS**
   - Generate SSL certificates
   - Update nginx.conf with SSL configuration
   - Configure proper CORS origins
   - Review security headers

2. **Secrets Management**
   - Replace all development passwords/keys
   - Configure proper JWT secrets
   - Set up proper MinIO credentials
   - Update database passwords

3. **Service Security**
   - Configure proper rate limiting
   - Set up IP whitelisting for admin service
   - Review CORS settings for each service

### 3. Database Configuration

1. **PostgreSQL**
   - Configure proper connection pools
   - Set up regular backups
   - Configure replication if needed
   - Set up proper indexes

2. **Redis**
   - Configure persistence
   - Set up proper maxmemory policy
   - Configure backup strategy

3. **Elasticsearch**
   - Configure proper sharding
   - Set up index lifecycle management
   - Configure backups
   - Optimize for production workloads

### 4. Storage Configuration

1. **MinIO**
   - Configure backup strategy
   - Set up proper bucket policies
   - Configure lifecycle rules
   - Set up monitoring

### 5. Monitoring & Logging

1. **Logging**
   - Configure log rotation
   - Set up log aggregation
   - Configure error tracking
   - Set up audit logging

2. **Monitoring**
   - Set up health checks
   - Configure resource monitoring
   - Set up alerting
   - Configure performance monitoring

### 6. Performance Optimization

1. **Caching Strategy**
   - Review Redis cache TTLs
   - Configure browser caching in Nginx
   - Set up CDN if needed

2. **Database Optimization**
   - Review and optimize indexes
   - Configure query caching
   - Set up connection pooling

### 7. Scaling Configuration

1. **Service Scaling**
   - Configure service replicas
   - Set up load balancing
   - Configure auto-scaling rules

2. **Database Scaling**
   - Configure connection pools
   - Set up read replicas if needed
   - Configure proper sharding

## Deployment Steps

1. Build production images:
```bash
docker-compose -f docker-compose.prod.yml build
```

2. Run database migrations:
```bash
# For each service with a database
docker-compose -f docker-compose.prod.yml run --rm {service} npx prisma migrate deploy
```

3. Start the services:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

4. Verify deployments:
```bash
docker-compose -f docker-compose.prod.yml ps
```

## Health Checks

- Auth Service: `http://localhost:3001/health`
- Blog Service: `http://localhost:3002/health`
- Analytics Service: `http://localhost:3003/health`
- Admin Service: `http://localhost:3004/health`
- Frontend: `http://localhost:3000`

## Monitoring

Monitor the following metrics:
- Service health status
- API response times
- Error rates
- Database connection pool status
- Cache hit rates
- Search performance
- Storage usage
- System resources (CPU, Memory, Disk)

## Backup Strategy

1. **Databases**
   - Full daily backups
   - Transaction log backups every hour
   - Test restore procedures regularly

2. **File Storage**
   - Regular MinIO bucket backups
   - Redundant storage configuration
   - Geographic replication if needed

3. **Configurations**
   - Version control all configurations
   - Regular backup of environment files
   - Document all custom settings

## Scaling Considerations

The system is designed to handle:
- 5 million daily active readers
- 10,000 daily active writers
- High concurrency for popular content
- Burst traffic during peak hours
