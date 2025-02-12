#!/bin/bash

# Script version and environment
ENVIRONMENT="development"
VERSION="1.1.0"

# Required commands
REQUIRED_COMMANDS=("docker" "jq" "curl")
OPTIONAL_COMMANDS=("pg_isready" "redis-cli")

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Help message
show_help() {
    echo -e "${BOLD}Usage:${NC} $0 [-e environment]"
    echo -e "\nOptions:"
    echo -e "  -e, --environment\tSpecify environment (development or production) [default: development]"
    echo -e "  -h, --help\t\tShow this help message"
    echo -e "\nExample:"
    echo -e "  $0 -e production"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            if [[ ! "$ENVIRONMENT" =~ ^(development|production)$ ]]; then
                echo -e "${RED}Error: Environment must be either 'development' or 'production'${NC}"
                exit 1
            fi
            shift 2
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            show_help
            ;;
    esac
done

# Environment suffix for container names
ENV_SUFFIX=""
[[ "$ENVIRONMENT" == "production" ]] && ENV_SUFFIX="-prod"

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
    ["Nginx"]="80"
    ["Prometheus"]="9090"
    ["Grafana"]="3005"
)

# Print header
print_header() {
    echo -e "\n${BOLD}${MAGENTA}ManKahi Microservices Health Status (${ENVIRONMENT})${NC}"
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
    
    # Get container health status first
    local container_name=""
    case $service_name in
        "PostgreSQL") container_name="postgres" ;;
        "Redis") container_name="redis" ;;
        "Elasticsearch") container_name="elasticsearch" ;;
        "MinIO") container_name="minio" ;;
        "Nginx") container_name="nginx" ;;
        "Prometheus") container_name="prometheus" ;;
        "Grafana") container_name="grafana" ;;
    esac

    if [ ! -z "$container_name" ]; then
        local health=$(check_container_health "$container_name")
        case "$health" in
            "healthy")
                true  # Container is healthy, continue with endpoint check
                ;;
            "starting")
                echo -e "${YELLOW}⟳ Starting${NC}"
                return 1
                ;;
            "waiting"|"running")
                echo -e "${YELLOW}⟳ Waiting for Health Check${NC}"
                return 1
                ;;
            *)
                echo -e "${RED}✗ Not Running${NC}"
                return 1
                ;;
        esac
    fi

    # Check service endpoint with timeout
    local timeout=5
    case $service_name in
        "PostgreSQL")
            if timeout $timeout pg_isready -h localhost -p $port -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "Redis")
            if timeout $timeout redis-cli -h localhost -p $port ping &>/dev/null || \
               timeout $timeout docker exec "mankahi-redis${ENV_SUFFIX}" redis-cli ping &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "Elasticsearch")
            if curl -s --max-time $timeout "http://localhost:$port/_cluster/health?wait_for_status=yellow&timeout=60s" &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "MinIO")
            if timeout $timeout docker exec "mankahi-minio${ENV_SUFFIX}" mc ready local &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "Nginx")
            if curl -s --max-time $timeout "http://localhost" &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "Prometheus")
            if curl -s --max-time $timeout "http://localhost:9090/-/ready" &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
        "Grafana")
            if curl -s --max-time $timeout -u admin:${GRAFANA_PASSWORD:-admin} "http://localhost:3005/api/health" &>/dev/null; then
                echo -e "${GREEN}✓ Running${NC}"
                return 0
            fi
            ;;
    esac
    
    echo -e "${RED}✗ Not Running${NC}"
    return 1
}

# Check Docker containers
check_containers() {
    print_section "Container Status"
    
    # Get all expected container names
    local expected_containers=(
        "auth" "blog" "analytics" "admin" "nginx" 
        "postgres" "redis" "elasticsearch" "minio" 
        "prometheus" "grafana"
    )
    
    # Check each container using check_container_health
    for container in "${expected_containers[@]}"; do
        printf "${BOLD}%-15s${NC}" "${container}"
        
        local health=$(check_container_health "$container")
        case "$health" in
            "healthy")
                echo -e "${GREEN}✓ Running${NC}"
                ;;
            "starting")
                echo -e "${YELLOW}⟳ Starting${NC}"
                ;;
            "waiting")
                echo -e "${YELLOW}⟳ Waiting${NC}"
                ;;
            "running")
                echo -e "${YELLOW}⟳ Waiting for Health Check${NC}"
                ;;
            *)
                echo -e "${RED}✗ Not Running${NC}"
                ;;
        esac
    done
    echo -e ""
}

# Check microservice health
check_service() {
    local service_name=$1
    local service_info=$2
    local port=$(echo $service_info | cut -d'|' -f1)
    local api_path=$(echo $service_info | cut -d'|' -f2)
    local dependencies=$(echo $service_info | cut -d'|' -f3)
    
    printf "${BOLD}%-15s${NC}" "$service_name"
    
    # Check container status using check_container_health
    local container_name="${api_path}"
    [[ "$api_path" == "blogs" ]] && container_name="blog"  # Handle blog service special case
    
    local health=$(check_container_health "$container_name")
    case "$health" in
        "healthy")
            true  # Container is healthy, continue with health checks
            ;;
        "starting")
            echo -e "${YELLOW}⟳ Starting${NC}"
            return
            ;;
        "waiting"|"running")
            echo -e "${YELLOW}⟳ Waiting for Health Check${NC}"
            return
            ;;
        "not_found")
            echo -e "${RED}✗ Not Operational${NC} (Container Not Running)"
            return
            ;;
        *)
            echo -e "${RED}✗ Not Operational${NC} (Container State: $health)"
            return
            ;;
    esac

    local timeout=5  # Match compose healthcheck timeout

    # Try gateway endpoint
    local gateway_response=$(curl -s --max-time $timeout "http://localhost/api/$api_path/health")
    local gateway_status=$?
    local gateway_valid=0
    
    # Try direct endpoint
    local direct_response=$(curl -s --max-time $timeout "http://localhost:$port/health")
    local direct_status=$?
    local direct_valid=0

    # Validate responses to match compose health checks: grep -q '"status":"healthy"'
    if [ $gateway_status -eq 0 ] && echo "$gateway_response" | grep -q '"status":"healthy"' && echo "$gateway_response" | jq -e . >/dev/null 2>&1; then
        gateway_valid=1
    fi
    if [ $direct_status -eq 0 ] && echo "$direct_response" | grep -q '"status":"healthy"' && echo "$direct_response" | jq -e . >/dev/null 2>&1; then
        direct_valid=1
    fi

    # Set response based on what's available, match compose healthcheck timeouts
    local response=""
    if [ $gateway_valid -eq 1 ]; then
        response="$gateway_response"
        echo -e "${GREEN}✓ Operational${NC}"
    elif [ $direct_valid -eq 1 ]; then
        response="$direct_response"
        echo -e "${YELLOW}✓ Operational${NC} (Direct Only)"
    else
        echo -e "${RED}✗ Not Operational${NC}"
        return
    fi

    # Show metrics if response is valid JSON with status field
    if [ ! -z "$response" ] && echo "$response" | jq -e '.status' >/dev/null 2>&1; then
        echo -e "\n${CYAN}Metrics:${NC}"
        format_json "$response"
    fi
    
    # Print dependencies status
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
    echo -e ""
}

# Check container health
check_container_health() {
    local container="$1"
    local status=$(docker ps --filter "name=mankahi-${container}${ENV_SUFFIX}" --format "{{.Status}}" || echo "")
    
    if [[ "$status" == *"(healthy)"* ]]; then
        echo "healthy"
    elif [[ "$status" == *"(health: starting)"* ]]; then
        echo "starting"
    elif [[ "$status" =~ ^Up.*[[:space:]]?\(?health.*\)?$ ]]; then
        echo "waiting"
    elif [[ "$status" == *"Up"* ]]; then
        echo "running"
    elif [[ -z "$status" ]]; then
        echo "not_found"
    else
        echo "error"
    fi
}

# Check dependencies and Docker
check_dependencies() {
    # Check required commands
    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo -e "${RED}Error: Required command '$cmd' is not installed${NC}"
            exit 2
        fi
    done

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        exit 3
    fi
}

# Main execution
print_header
check_dependencies

# Set project name based on environment
PROJECT_NAME="mankahi-dev-compose"
if [ "$ENVIRONMENT" == "production" ]; then
    PROJECT_NAME="mankahi-prod-compose"
fi

# Check if deployment exists and its status
deployment_status=$(docker compose ls --format json | jq -r --arg name "$PROJECT_NAME" '.[] | select(.Name==$name) | {Name: .Name, Status: .Status}' 2>/dev/null || true)

if [ -z "$deployment_status" ]; then
    # Check if it exists but is stopped
    stopped_status=$(docker compose ls -a --format json | jq -r --arg name "$PROJECT_NAME" '.[] | select(.Name==$name) | .Status' 2>/dev/null || true)
    if [ -z "$stopped_status" ]; then
        echo -e "${RED}✗ No $ENVIRONMENT deployment found${NC}"
    else
        echo -e "${RED}✗ $ENVIRONMENT deployment exists but is stopped${NC}"
    fi
    exit 1
fi

status=$(echo "$deployment_status" | jq -r '.Status')

if echo "$status" | grep -q "^running([0-9]*)$"; then
    # Fully running
    container_count=$(echo "$status" | grep -o '[0-9]\+' || echo "0")
    echo -e "${GREEN}✓ $ENVIRONMENT deployment is running ($container_count containers)${NC}"
elif echo "$status" | grep -q "running([0-9]*)"; then
    # Partially running
    running_count=$(echo "$status" | grep -o '[0-9]\+' || echo "0")
    echo -e "${RED}✗ $ENVIRONMENT deployment is incomplete (only $running_count containers running)${NC}"
    exit 1
elif echo "$status" | grep -q "exited"; then
    echo -e "${RED}✗ $ENVIRONMENT deployment has stopped unexpectedly${NC}"
    exit 1
else
    echo -e "${RED}✗ $ENVIRONMENT deployment is in an unknown state: $status${NC}"
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
        echo -e "$service: ${GREEN}✓ Operational${NC}"
    else
        echo -e "$service: ${RED}✗ Not Operational${NC}"
    fi
done

echo -e "\n${BOLD}Microservices:${NC}"
for service in "${!SERVICES[@]}"; do
    port=$(echo ${SERVICES[$service]} | cut -d'|' -f1)
    api_path=$(echo ${SERVICES[$service]} | cut -d'|' -f2)
    
    # Try gateway endpoint first (preferred path)
    gateway_response=$(curl -s --max-time 5 "http://localhost/api/${api_path}/health")
    
    if [ $? -eq 0 ] && echo "$gateway_response" | grep -q '"status":"healthy"'; then
        echo -e "$service: ${GREEN}✓ Operational${NC}"
    else
        # Try direct endpoint as fallback
        direct_response=$(curl -s --max-time 5 "http://localhost:${port}/health")
        if [ $? -eq 0 ] && echo "$direct_response" | grep -q '"status":"healthy"'; then
            echo -e "$service: ${YELLOW}✓ Operational${NC} (Direct Only)"
        else
            echo -e "$service: ${RED}✗ Not Operational${NC}"
        fi
    fi
done
