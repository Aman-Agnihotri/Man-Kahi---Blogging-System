#!/bin/bash

set -e  # Exit on error

# Source common cluster check functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common/check-cluster.sh"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Set default values
NAMESPACE="mankahi"
SERVICE=""
TAIL_LINES=100
COMPONENT=""
WATCH_MODE=false
WATCH_INTERVAL=5
OUTPUT_FORMAT="plain"  # plain, json, or yaml
CONNECT_TIMEOUT=5

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      NAMESPACE="$2"
      shift; shift
      ;;
    -s|--service)
      SERVICE="$2"
      shift; shift
      ;;
    -l|--lines)
      TAIL_LINES="$2"
      shift; shift
      ;;
    -c|--component)
      COMPONENT="$2"
      shift; shift
      ;;
    -w|--watch)
      WATCH_MODE=true
      shift
      ;;
    -i|--interval)
      WATCH_INTERVAL="$2"
      shift; shift
      ;;
    -o|--output)
      OUTPUT_FORMAT="$2"
      shift; shift
      ;;
    -t|--timeout)
      CONNECT_TIMEOUT="$2"
      shift; shift
      ;;
    -h|--help)
      echo "Usage: ./monitor.sh [options]"
      echo ""
      echo "Options:"
      echo "  -n, --namespace     Set namespace (default: mankahi)"
      echo "  -s, --service       Service name for logs/metrics"
      echo "  -l, --lines         Number of log lines to show (default: 100)"
      echo "  -c, --component     Component to monitor (health|pods|services|ingress|logs|metrics|resources)"
      echo "  -w, --watch         Enable watch mode"
      echo "  -i, --interval      Watch interval in seconds (default: 5)"
      echo "  -o, --output        Output format (plain|json|yaml)"
      echo "  -t, --timeout       Connection timeout in seconds (default: 5)"
      echo "  -h, --help          Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Verify cluster access before proceeding
if ! verify_cluster_access "$NAMESPACE" "$CONNECT_TIMEOUT"; then
    exit 1
fi

# Validate output format
if [[ ! "$OUTPUT_FORMAT" =~ ^(plain|json|yaml)$ ]]; then
    echo -e "${RED}Invalid output format. Must be 'plain', 'json', or 'yaml'${NC}"
    exit 1
fi

# Function to draw header
draw_header() {
    local title="$1"
    local width=80
    local padding=$(( (width - ${#title}) / 2 ))
    echo
    printf '=%.0s' $(seq 1 $width)
    echo
    printf "%${padding}s%s%${padding}s\n" "" "$title" ""
    printf '=%.0s' $(seq 1 $width)
    echo
}

# Format output based on selected format
format_output() {
    if [ "$OUTPUT_FORMAT" = "json" ]; then
        jq '.' 2>/dev/null || cat
    elif [ "$OUTPUT_FORMAT" = "yaml" ]; then
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

# Check health of all services
check_health() {
    draw_header "Service Health Status"
    
    # Get deployments status
    echo -e "${BLUE}Deployment Status:${NC}"
    kubectl_safe get deployments -n $NAMESPACE -o wide | format_output
    
    echo -e "\n${BLUE}Pod Status:${NC}"
    kubectl_safe get pods -n $NAMESPACE -o wide | format_output
    
    echo -e "\n${BLUE}Resource Usage:${NC}"
    kubectl_safe top pods -n $NAMESPACE 2>/dev/null || echo -e "${YELLOW}Metrics server not available${NC}"
    
    # Check readiness/liveness probes
    echo -e "\n${BLUE}Health Probe Status:${NC}"
    kubectl_safe get pods -n $NAMESPACE -o json | \
    jq -r '.items[] | select(.status.conditions[] | select(.type=="Ready" and .status!="True")) | .metadata.name' | \
    while read pod; do
        echo -e "${RED}✗ $pod is not ready${NC}"
    done
}

# Show detailed pod status
show_pods() {
    draw_header "Pod Status"
    if [ "$OUTPUT_FORMAT" = "plain" ]; then
        kubectl_safe get pods -n $NAMESPACE -o wide
        echo -e "\n${BLUE}Pod Conditions:${NC}"
        kubectl_safe get pods -n $NAMESPACE -o json | \
        jq -r '.items[] | "Pod: \(.metadata.name)\nStatus: \(.status.phase)\nConditions: \(.status.conditions[]? | "\n  \(.type): \(.status)")\n"'
    else
        kubectl_safe get pods -n $NAMESPACE -o $OUTPUT_FORMAT | format_output
    fi
}

# Show service status and endpoints
show_services() {
    draw_header "Service Status"
    if [ "$OUTPUT_FORMAT" = "plain" ]; then
        kubectl_safe get services -n $NAMESPACE
        echo -e "\n${BLUE}Service Endpoints:${NC}"
        kubectl_safe get endpoints -n $NAMESPACE
    else
        kubectl_safe get services,endpoints -n $NAMESPACE -o $OUTPUT_FORMAT | format_output
    fi
}

# Show ingress status and rules
show_ingress() {
    draw_header "Ingress Status"
    kubectl_safe get ingress -n $NAMESPACE -o $OUTPUT_FORMAT | format_output
    
    if [ "$OUTPUT_FORMAT" = "plain" ]; then
        echo -e "\n${BLUE}Ingress Rules:${NC}"
        kubectl_safe get ingress -n $NAMESPACE -o json | \
        jq -r '.items[] | "Ingress: \(.metadata.name)\nRules: \(.spec.rules[]? | "\n  Host: \(.host)\n  Paths: \(.http.paths[]? | "\n    Path: \(.path)\n    Service: \(.backend.service.name):\(.backend.service.port.number)")")\n"'
    fi
}

# Show service logs with optional filtering
show_logs() {
    if [ -z "$SERVICE" ]; then
        echo -e "${RED}Error: Service name is required for logs${NC}"
        exit 1
    fi
    
    draw_header "Service Logs: $SERVICE"
    
    # Verify service exists
    if ! kubectl_safe get deployment $SERVICE -n $NAMESPACE >/dev/null 2>&1; then
        echo -e "${RED}Error: Service '$SERVICE' not found${NC}"
        exit 1
    }
    
    if [ "$WATCH_MODE" = true ]; then
        kubectl_safe logs -n $NAMESPACE -l app=$SERVICE -f --tail=$TAIL_LINES
    else
        kubectl_safe logs -n $NAMESPACE -l app=$SERVICE --tail=$TAIL_LINES
    fi
}

# Show detailed metrics
show_metrics() {
    draw_header "Service Metrics"
    
    # Check if metrics-server is available
    if ! kubectl_safe top pods -n $NAMESPACE &>/dev/null; then
        echo -e "${RED}Error: metrics-server not available${NC}"
        return 1
    fi
    
    if [ -n "$SERVICE" ]; then
        echo -e "${BLUE}Metrics for $SERVICE:${NC}"
        kubectl_safe top pods -n $NAMESPACE -l app=$SERVICE | format_output
    else
        echo -e "${BLUE}All Service Metrics:${NC}"
        kubectl_safe top pods -n $NAMESPACE | format_output
    fi
    
    # Show node metrics
    echo -e "\n${BLUE}Node Metrics:${NC}"
    kubectl_safe top nodes | format_output
}

# Show detailed resource usage
show_resources() {
    draw_header "Resource Usage"
    
    echo -e "${BLUE}CPU and Memory Usage:${NC}"
    kubectl_safe top pods -n $NAMESPACE 2>/dev/null || echo -e "${YELLOW}Metrics server not available${NC}"
    
    echo -e "\n${BLUE}Resource Quotas:${NC}"
    kubectl_safe describe resourcequota -n $NAMESPACE 2>/dev/null || echo -e "${YELLOW}No resource quotas defined${NC}"
    
    echo -e "\n${BLUE}Persistent Volume Claims:${NC}"
    kubectl_safe get pvc -n $NAMESPACE -o $OUTPUT_FORMAT | format_output
    
    echo -e "\n${BLUE}Resource Limits and Requests:${NC}"
    kubectl_safe get pods -n $NAMESPACE -o json | \
    jq -r '.items[] | select(.spec.containers[].resources != null) | "Pod: \(.metadata.name)\n\(.spec.containers[] | "Container: \(.name)\n  Limits: \(.resources.limits)\n  Requests: \(.resources.requests)\n")"'
}

# Watch mode wrapper
watch_component() {
    local component=$1
    shift
    
    if [ "$WATCH_MODE" = true ]; then
        while true; do
            clear
            $component "$@"
            sleep $WATCH_INTERVAL
        done
    else
        $component "$@"
    fi
}

# Main execution
case $COMPONENT in
    "health")
        watch_component check_health
        ;;
    "pods")
        watch_component show_pods
        ;;
    "services")
        watch_component show_services
        ;;
    "ingress")
        watch_component show_ingress
        ;;
    "logs")
        show_logs  # Logs have their own watch mechanism
        ;;
    "metrics")
        watch_component show_metrics
        ;;
    "resources")
        watch_component show_resources
        ;;
    *)
        echo -e "${RED}Invalid component. Use -h for help${NC}"
        exit 1
        ;;
esac
