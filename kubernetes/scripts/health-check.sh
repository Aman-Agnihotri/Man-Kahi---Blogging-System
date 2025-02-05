#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Service definitions with ports and API paths
declare -A SERVICES=(
    ["Auth"]="3001|auth|database,redis"
    ["Blog"]="3002|blogs|database,redis,elasticsearch"
    ["Analytics"]="3003|analytics|database,redis"
    ["Admin"]="3004|admin|database"
)

# Infrastructure services
declare -A INFRA_SERVICES=(
    ["PostgreSQL"]="5432"
    ["Redis"]="6379"
    ["Elasticsearch"]="9200"
    ["MinIO"]="9000"
)

# Print header
print_header() {
    echo -e "\n${BOLD}${MAGENTA}ManKahi Microservices Health Status${NC}"
    echo -e "${BOLD}$(date '+%Y-%m-%d %H:%M:%S')${NC}\n"
    printf '=%.0s' {1..80}
    echo -e "\n"
}

# Format JSON output
format_json() {
    if command -v jq &> /dev/null; then
        echo "$1" | jq '.' 2>/dev/null || echo "$1"
    else
        echo "$1" | python3 -m json.tool 2>/dev/null || echo "$1"
    fi
}

# Print section header
print_section() {
    echo -e "\n${BOLD}${BLUE}$1${NC}"
    printf '=%.0s' {1..80}
    echo -e "\n"
}

# Check infrastructure service health
check_infra_service() {
    local service_name=$1
    local port=$2
    
    printf "${BOLD}%-15s${NC}" "$service_name"
    
    case $service_name in
        "PostgreSQL")
            if pg_isready -h localhost -p $port &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "Redis")
            if redis-cli -h localhost -p $port ping &>/dev/null || docker exec mankahi-redis redis-cli ping &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "Elasticsearch")
            if curl -s "http://localhost:$port/_cluster/health" &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "MinIO")
            if curl -s "http://localhost:$port/minio/health/ready" &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
    esac
    
    echo -e "${RED}✗ Not Running${NC}"
    return 1
}

# Check microservice health
check_service() {
    local service_name=$1
    local service_info=$2
    local port=$(echo $service_info | cut -d'|' -f1)
    local api_path=$(echo $service_info | cut -d'|' -f2)
    local dependencies=$(echo $service_info | cut -d'|' -f3)
    
    printf "${BOLD}%-15s${NC}" "$service_name"
    
    # Try direct endpoint first (more reliable)
    local direct_response=$(curl -s "http://localhost:$port/health")
    local direct_status=$?
    
    # Try gateway endpoint
    local gateway_response=$(curl -s "http://localhost/api/$api_path/health")
    local gateway_status=$?

    local response=""
    local status_type=""
    
    # Determine which response to use and status type
    if [ $direct_status -eq 0 ] && ! echo "$direct_response" | grep -q "Error\|error\|Cannot GET"; then
        response="$direct_response"
        status_type="direct"
    elif [ $gateway_status -eq 0 ] && ! echo "$gateway_response" | grep -q "Error\|error\|Cannot GET"; then
        response="$gateway_response"
        status_type="gateway"
    else
        status_type="failed"
    fi

    # Display status
    case $status_type in
        "direct")
            echo -e "${YELLOW}✓ Healthy${NC} (Direct Only)"
            ;;
        "gateway")
            echo -e "${GREEN}✓ Healthy${NC} (via Gateway)"
            ;;
        "failed")
            echo -e "${RED}✗ Unhealthy${NC}"
            echo -e "${RED}Both gateway and direct endpoints failed${NC}"
            ;;
    esac

    # Show metrics if available
    if [ ! -z "$response" ]; then
        if echo "$response" | grep -q "metrics\|memory\|cpu"; then
            echo -e "\n${CYAN}Metrics:${NC}"
            format_json "$response"
        fi
    fi
    
    # Print dependencies status if response exists
    if [ ! -z "$response" ] && [ ! -z "$dependencies" ]; then
        echo -e "\n${BOLD}Dependencies:${NC}"
        IFS=',' read -ra DEPS <<< "$dependencies"
        for dep in "${DEPS[@]}"; do
            # Try to extract status from metrics.connections first
            local status=$(echo "$response" | jq -r ".metrics.connections.$dep // .connections.$dep // \"unknown\"" 2>/dev/null)
            if [ "$status" = "true" ] || [ "$status" = "connected" ]; then
                echo -e "  $dep: ${GREEN}Connected${NC}"
            else
                # Fallback to checking if the dependency name exists in response
                if echo "$response" | grep -qi "$dep.*connected\|connected.*$dep"; then
                    echo -e "  $dep: ${GREEN}Connected${NC}"
                else
                    echo -e "  $dep: ${RED}Disconnected${NC}"
                fi
            fi
        done
    fi
    echo -e "\n"
}

# Check Docker containers
check_containers() {
    print_section "Container Status"
    
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | 
    grep -E "mankahi-(auth|blog|analytics|admin|nginx|postgres|redis|elasticsearch|minio)" || 
    echo -e "${RED}No containers found${NC}"
    echo -e "\n"
}

# Main execution
print_header

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Check containers
check_containers

# Check infrastructure services
print_section "Infrastructure Services"
for service in "${!INFRA_SERVICES[@]}"; do
    check_infra_service "$service" "${INFRA_SERVICES[$service]}"
done

# Check microservices
print_section "Microservices"
for service in "${!SERVICES[@]}"; do
    check_service "$service" "${SERVICES[$service]}"
done

# Final status summary
print_section "Overall Status"
echo -e "${BOLD}Infrastructure:${NC}"
for service in "${!INFRA_SERVICES[@]}"; do
    if check_infra_service "$service" "${INFRA_SERVICES[$service]}" &>/dev/null; then
        echo -e "$service: ${GREEN}Operational${NC}"
    else
        echo -e "$service: ${RED}Non-Operational${NC}"
    fi
done

echo -e "\n${BOLD}Microservices:${NC}"
for service in "${!SERVICES[@]}"; do
    port=$(echo ${SERVICES[$service]} | cut -d'|' -f1)
    api_path=$(echo ${SERVICES[$service]} | cut -d'|' -f2)
    
    # Try direct endpoint first
    direct_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/health")
    gateway_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/api/${api_path}/health")
    
    if [ "$gateway_response" = "200" ]; then
        echo -e "$service: ${GREEN}Operational${NC} (Gateway)"
    elif [ "$direct_response" = "200" ]; then
        echo -e "$service: ${YELLOW}Operational${NC} (Direct Only)"
    else
        echo -e "$service: ${RED}Non-Operational${NC}"
    fi
done
