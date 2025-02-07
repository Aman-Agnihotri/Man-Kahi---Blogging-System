#!/bin/bash

set -e  # Exit on error

# Source common cluster check functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common/check-cluster.sh"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Set default values
NAMESPACE="mankahi"
OUTPUT_FORMAT="plain"
TIMEOUT=5
VERBOSE=false
CHECK_DEPENDENCIES=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      NAMESPACE="$2"
      shift; shift
      ;;
    -o|--output)
      OUTPUT_FORMAT="$2"
      shift; shift
      ;;
    -t|--timeout)
      TIMEOUT="$2"
      shift; shift
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    --skip-dependencies)
      CHECK_DEPENDENCIES=false
      shift
      ;;
    -h|--help)
      echo "Usage: ./health-check.sh [options]"
      echo ""
      echo "Options:"
      echo "  -n, --namespace        Set namespace (default: mankahi)"
      echo "  -o, --output          Output format (plain|json|yaml)"
      echo "  -t, --timeout         Timeout in seconds (default: 5)"
      echo "  -v, --verbose         Show detailed output"
      echo "      --skip-dependencies Skip dependency checks"
      echo "  -h, --help           Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Verify cluster access before proceeding
if ! verify_cluster_access "$NAMESPACE" "$TIMEOUT"; then
    exit 1
fi

# Service definitions with health endpoints and dependencies
declare -A SERVICES=(
    ["auth"]="3001|/health|database,redis"
    ["blog"]="3002|/health|database,redis,elasticsearch"
    ["analytics"]="3003|/health|database,redis"
    ["admin"]="3004|/health|database"
)

# Infrastructure services
declare -A INFRA_SERVICES=(
    ["postgres"]="5432|database"
    ["redis"]="6379|cache"
    ["elasticsearch"]="9200|search"
    ["minio"]="9000|storage"
)

# Print header
print_header() {
    local title="$1"
    local width=80
    local padding=$(( (width - ${#title}) / 2 ))
    echo
    printf '=%.0s' $(seq 1 $width)
    echo -e "\n${BOLD}${MAGENTA}$title${NC}"
    printf '=%.0s' $(seq 1 $width)
    echo
}

# Format JSON output
format_output() {
    if [ "$OUTPUT_FORMAT" = "json" ] && command -v jq &> /dev/null; then
        jq '.' 2>/dev/null || cat
    elif [ "$OUTPUT_FORMAT" = "yaml" ] && command -v yq &> /dev/null; then
        yq eval -P '.' 2>/dev/null || cat
    else
        cat
    fi
}

# Error handling wrapper for kubectl commands
kubectl_safe() {
    if ! kubectl "$@"; then
        echo -e "${RED}Error executing: kubectl $*${NC}"
        return 1
    fi
}

# Check infrastructure service health
check_infra_service() {
    local service_name=$1
    local info=$2
    local port=$(echo $info | cut -d'|' -f1)
    local type=$(echo $info | cut -d'|' -f2)
    
    echo -e "${CYAN}Checking $service_name...${NC}"
    
    # Get pod name with retries
    local max_retries=3
    local retry_count=0
    local pod=""
    
    while [ $retry_count -lt $max_retries ]; do
        pod=$(kubectl_safe get pod -n $NAMESPACE -l app=$service_name -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        if [ ! -z "$pod" ]; then
            break
        fi
        retry_count=$((retry_count+1))
        [ $retry_count -lt $max_retries ] && echo -e "  ${YELLOW}Retrying pod lookup ($retry_count/$max_retries)...${NC}" && sleep 2
    done

    if [ -z "$pod" ]; then
        echo -e "  ${RED}✗ Pod not found${NC}"
        return 1
    fi

    # Check pod ready status
    if ! kubectl_safe get pod $pod -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' | grep -q "True"; then
        echo -e "  ${RED}✗ Pod not ready${NC}"
        if [ "$VERBOSE" = true ]; then
            echo -e "  Pod Status:"
            kubectl_safe describe pod $pod -n $NAMESPACE
        fi
        return 1
    fi

    # Service-specific health checks with timeout
    case $service_name in
        "postgres")
            if timeout $TIMEOUT kubectl exec $pod -n $NAMESPACE -- pg_isready -U postgres &>/dev/null; then
                echo -e "  ${GREEN}✓ Database is accepting connections${NC}"
                [ "$VERBOSE" = true ] && kubectl_safe exec $pod -n $NAMESPACE -- pg_isready -U postgres
            else
                echo -e "  ${RED}✗ Database is not responding${NC}"
                return 1
            fi
            ;;
        "redis")
            if timeout $TIMEOUT kubectl exec $pod -n $NAMESPACE -- redis-cli ping | grep -q "PONG"; then
                echo -e "  ${GREEN}✓ Redis is responsive${NC}"
                [ "$VERBOSE" = true ] && kubectl_safe exec $pod -n $NAMESPACE -- redis-cli info | grep 'redis_version\|connected_clients\|used_memory_human'
            else
                echo -e "  ${RED}✗ Redis is not responding${NC}"
                return 1
            fi
            ;;
        "elasticsearch")
            local health_resp=$(timeout $TIMEOUT kubectl exec $pod -n $NAMESPACE -- curl -s "localhost:9200/_cluster/health")
            local status=$(echo "$health_resp" | jq -r '.status' 2>/dev/null)
            case $status in
                "green")
                    echo -e "  ${GREEN}✓ Elasticsearch cluster is healthy${NC}"
                    ;;
                "yellow")
                    echo -e "  ${YELLOW}⚠ Elasticsearch cluster is in warning state${NC}"
                    ;;
                *)
                    echo -e "  ${RED}✗ Elasticsearch cluster is unhealthy${NC}"
                    return 1
                    ;;
            esac
            [ "$VERBOSE" = true ] && echo "$health_resp" | jq '.'
            ;;
        "minio")
            if timeout $TIMEOUT kubectl exec $pod -n $NAMESPACE -- curl -s "localhost:9000/minio/health/ready" &>/dev/null; then
                echo -e "  ${GREEN}✓ MinIO is ready${NC}"
                [ "$VERBOSE" = true ] && kubectl_safe exec $pod -n $NAMESPACE -- mc admin info local
            else
                echo -e "  ${RED}✗ MinIO is not responding${NC}"
                return 1
            fi
            ;;
    esac

    return 0
}

# Check microservice health
check_service() {
    local service_name=$1
    local info=$2
    local port=$(echo $info | cut -d'|' -f1)
    local health_path=$(echo $info | cut -d'|' -f2)
    local dependencies=$(echo $info | cut -d'|' -f3)
    
    echo -e "${CYAN}Checking $service_name service...${NC}"
    
    # Check deployment status with retries
    local max_retries=3
    local retry_count=0
    local replicas=""
    
    while [ $retry_count -lt $max_retries ]; do
        replicas=$(kubectl_safe get deployment $service_name -n $NAMESPACE -o jsonpath='{.status.availableReplicas}' 2>/dev/null)
        if [ ! -z "$replicas" ] && [ "$replicas" -gt 0 ]; then
            break
        fi
        retry_count=$((retry_count+1))
        [ $retry_count -lt $max_retries ] && echo -e "  ${YELLOW}Retrying deployment check ($retry_count/$max_retries)...${NC}" && sleep 2
    done

    if [ -z "$replicas" ] || [ "$replicas" -eq 0 ]; then
        echo -e "  ${RED}✗ No replicas available${NC}"
        return 1
    fi

    # Check pod health
    local pod=$(kubectl_safe get pod -n $NAMESPACE -l app=$service_name -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -z "$pod" ]; then
        echo -e "  ${RED}✗ Pod not found${NC}"
        return 1
    fi

    # Check health endpoint with timeout
    local health_response=""
    if health_response=$(timeout $TIMEOUT kubectl exec $pod -n $NAMESPACE -- curl -s "localhost:$port$health_path"); then
        echo -e "  ${GREEN}✓ Service is healthy${NC}"
        [ "$VERBOSE" = true ] && echo -e "  Response: $health_response" | jq '.' 2>/dev/null || echo "$health_response"
    else
        echo -e "  ${RED}✗ Service health check failed${NC}"
        return 1
    fi

    # Check dependencies if enabled
    if [ "$CHECK_DEPENDENCIES" = true ] && [ ! -z "$dependencies" ]; then
        echo -e "  ${BLUE}Dependencies:${NC}"
        IFS=',' read -ra DEPS <<< "$dependencies"
        for dep in "${DEPS[@]}"; do
            local status=$(echo "$health_response" | jq -r ".dependencies.$dep // \"unknown\"" 2>/dev/null)
            if [ "$status" = "true" ] || [ "$status" = "connected" ]; then
                echo -e "    ${GREEN}✓ $dep${NC}"
            else
                echo -e "    ${RED}✗ $dep${NC}"
                [ "$VERBOSE" = true ] && echo -e "    Connection details not available"
            fi
        done
    fi

    return 0
}

# Main execution
print_header "ManKahi Infrastructure Health Check"
echo -e "${BOLD}Time:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "${BOLD}Namespace:${NC} $NAMESPACE"
echo -e "${BOLD}Timeout:${NC} ${TIMEOUT}s"

# Check infrastructure services
print_header "Infrastructure Services"
infra_status=0
for service in "${!INFRA_SERVICES[@]}"; do
    check_infra_service "$service" "${INFRA_SERVICES[$service]}" || infra_status=1
done

# Check microservices
print_header "Microservices"
services_status=0
for service in "${!SERVICES[@]}"; do
    check_service "$service" "${SERVICES[$service]}" || services_status=1
done

# Print summary
print_header "Health Check Summary"
if [ $infra_status -eq 0 ]; then
    echo -e "${GREEN}✓ Infrastructure: Healthy${NC}"
else
    echo -e "${RED}✗ Infrastructure: Issues Detected${NC}"
fi

if [ $services_status -eq 0 ]; then
    echo -e "${GREEN}✓ Microservices: Healthy${NC}"
else
    echo -e "${RED}✗ Microservices: Issues Detected${NC}"
fi

# Exit with appropriate status
[ $infra_status -eq 0 ] && [ $services_status -eq 0 ] || exit 1
