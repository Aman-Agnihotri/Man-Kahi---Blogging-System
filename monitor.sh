#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment variables
set -a
source .env.production
set +a

# Function to print section header
print_header() {
    echo -e "\n${YELLOW}=== $1 ===${NC}"
}

# Function to check service health
check_service_health() {
    local service=$1
    local port=$2
    if curl -s "http://localhost:${port}/health" > /dev/null; then
        echo -e "${GREEN}✓${NC} $service is healthy"
        return 0
    else
        echo -e "${RED}✗${NC} $service is not responding"
        return 1
    fi
}

# Function to get container stats
get_container_stats() {
    local container=$1
    echo "$(docker stats --no-stream --format "CPU: {{.CPUPerc}}, Memory: {{.MemPerc}}" $container)"
}

# Monitor system health
monitor_system() {
    print_header "System Health Check"
    
    # Check services health
    check_service_health "Auth Service" 3001
    check_service_health "Blog Service" 3002
    check_service_health "Analytics Service" 3003
    check_service_health "Admin Service" 3004
    check_service_health "Frontend" 3000

    # Database connection check
    print_header "Database Status"
    docker-compose -f docker-compose.prod.yml exec -T postgres pg_isready && \
        echo -e "${GREEN}✓${NC} PostgreSQL is accepting connections" || \
        echo -e "${RED}✗${NC} PostgreSQL is not responding"

    # Redis check
    print_header "Redis Status"
    docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping | grep -q "PONG" && \
        echo -e "${GREEN}✓${NC} Redis is responding" || \
        echo -e "${RED}✗${NC} Redis is not responding"

    # Elasticsearch check
    print_header "Elasticsearch Status"
    curl -s "http://localhost:9200/_cluster/health" | grep -q "status.*green" && \
        echo -e "${GREEN}✓${NC} Elasticsearch cluster is healthy" || \
        echo -e "${RED}✗${NC} Elasticsearch cluster issues detected"

    # MinIO check
    print_header "MinIO Status"
    docker-compose -f docker-compose.prod.yml exec -T minio mc ready local && \
        echo -e "${GREEN}✓${NC} MinIO is operational" || \
        echo -e "${RED}✗${NC} MinIO is not responding"
}

# Monitor resource usage
monitor_resources() {
    print_header "Resource Usage"
    
    echo "Container Resource Usage:"
    for container in mankahi-auth-prod mankahi-blog-prod mankahi-analytics-prod mankahi-admin-prod mankahi-frontend-prod; do
        echo -e "\n${YELLOW}$container:${NC}"
        get_container_stats $container
    done

    print_header "Database Metrics"
    docker-compose -f docker-compose.prod.yml exec -T postgres psql -U $POSTGRES_USER -c "
        SELECT datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit
        FROM pg_stat_database WHERE datname LIKE 'mankahi_%';"

    print_header "Redis Metrics"
    docker-compose -f docker-compose.prod.yml exec -T redis redis-cli info | grep -E "connected_clients|used_memory_human|total_connections_received"

    print_header "Elasticsearch Metrics"
    curl -s "http://localhost:9200/_cluster/stats" | jq -r '.indices | {count: .count, docs: .docs.count, store_size: .store.size_in_bytes}'
}

# Monitor application metrics
monitor_application() {
    print_header "Application Metrics"

    # Get recent error logs
    echo "Recent Error Logs:"
    for service in auth blog analytics admin; do
        echo -e "\n${YELLOW}${service}-service errors:${NC}"
        docker-compose -f docker-compose.prod.yml logs --tail=10 ${service}-service | grep -i error
    done

    # Get API response times
    print_header "API Response Times (last minute)"
    docker-compose -f docker-compose.prod.yml exec -T nginx grep -i "request_time" /var/log/nginx/access.log | \
        tail -n 50 | awk '{print $7" "$11}' | sort -n

    # Get active users
    print_header "Active Users"
    curl -s "http://localhost:3003/api/analytics/active-users"
}

# Main monitoring loop
case "${1:-all}" in
    "health")
        monitor_system
        ;;
    "resources")
        monitor_resources
        ;;
    "application")
        monitor_application
        ;;
    "all")
        monitor_system
        monitor_resources
        monitor_application
        ;;
    *)
        echo "Usage: $0 [health|resources|application|all]"
        exit 1
        ;;
esac

# Add timestamp
echo -e "\n${YELLOW}Report generated at: $(date)${NC}"

# Print alerts if any service is down
print_header "Alerts"
if [ -f "alerts.log" ]; then
    cat alerts.log
else
    echo "No active alerts"
fi

echo -e "\n${GREEN}Monitoring completed${NC}"
