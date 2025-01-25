#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "${RED}Error: .env.production file not found${NC}"
    echo -e "${YELLOW}Please create .env.production file from .env.production.example${NC}"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check required commands
for cmd in docker docker-compose; do
    if ! command_exists "$cmd"; then
        echo -e "${RED}Error: $cmd is not installed${NC}"
        exit 1
    fi
done

# Load environment variables
set -a
source .env.production
set +a

echo -e "${YELLOW}Starting deployment process...${NC}"

# Create required directories
echo "Creating required directories..."
mkdir -p nginx/ssl
mkdir -p docker/postgres

# Check SSL certificates
if [ ! -f "nginx/ssl/mankahi.com.crt" ] || [ ! -f "nginx/ssl/mankahi.com.key" ]; then
    echo -e "${YELLOW}Warning: SSL certificates not found in nginx/ssl/${NC}"
    echo "Please ensure SSL certificates are properly configured before running in production"
fi

# Pull latest images
echo "Pulling latest images..."
docker-compose -f docker-compose.prod.yml pull || {
    echo -e "${RED}Failed to pull images${NC}"
    exit 1
}

# Build services
echo "Building services..."
docker-compose -f docker-compose.prod.yml build || {
    echo -e "${RED}Failed to build services${NC}"
    exit 1
}

# Run database migrations
echo "Running database migrations..."
for service in auth-service blog-service analytics-service; do
    echo "Migrating $service database..."
    docker-compose -f docker-compose.prod.yml run --rm $service npx prisma migrate deploy || {
        echo -e "${RED}Failed to run migrations for $service${NC}"
        exit 1
    }
done

# Start services
echo "Starting services..."
docker-compose -f docker-compose.prod.yml up -d || {
    echo -e "${RED}Failed to start services${NC}"
    exit 1
}

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 10

# Check service health
echo "Checking service health..."
for service in auth-service blog-service analytics-service admin-service frontend; do
    if ! curl -s "http://localhost:${PORT:-3000}/health" > /dev/null; then
        echo -e "${RED}Warning: $service health check failed${NC}"
    else
        echo -e "${GREEN}$service is healthy${NC}"
    fi
done

# Initialize Elasticsearch indices
echo "Initializing Elasticsearch..."
docker-compose -f docker-compose.prod.yml exec blog-service npm run init:elasticsearch || {
    echo -e "${YELLOW}Warning: Failed to initialize Elasticsearch indices${NC}"
}

# Create MinIO buckets
echo "Initializing MinIO buckets..."
docker-compose -f docker-compose.prod.yml exec minio mc mb minio/mankahi-uploads || {
    echo -e "${YELLOW}Warning: Failed to create MinIO bucket${NC}"
}

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "You can access the services at:"
echo -e "Frontend: ${YELLOW}https://mankahi.com${NC}"
echo -e "API: ${YELLOW}https://api.mankahi.com${NC}"
echo -e "Admin Dashboard: ${YELLOW}https://admin.mankahi.com${NC}"

# Print monitoring instructions
echo -e "\n${YELLOW}Monitoring Instructions:${NC}"
echo "1. Check logs: docker-compose -f docker-compose.prod.yml logs -f [service]"
echo "2. Monitor resources: docker stats"
echo "3. View service status: docker-compose -f docker-compose.prod.yml ps"
echo "4. Check nginx status: curl http://localhost/nginx_status"

echo -e "\n${YELLOW}Remember to:${NC}"
echo "1. Set up monitoring and alerting"
echo "2. Configure backup schedules"
echo "3. Set up SSL certificate auto-renewal"
echo "4. Review security settings"
