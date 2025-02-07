#!/bin/bash

set -e  # Exit on error

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common/check-cluster.sh"
source "$SCRIPT_DIR/common/sudo-helper.sh"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Set default values
ENVIRONMENT="development"
NAMESPACE="mankahi"
ACTION="apply"
SKIP_CONFIRM=false
DRY_RUN=false
WATCH_MODE=false
WATCH_INTERVAL=5
HEALTH_CHECK=false
OUTPUT_FORMAT="plain"  # plain, json, or yaml

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -e|--environment)
      ENVIRONMENT="$2"
      shift; shift
      ;;
    -n|--namespace)
      NAMESPACE="$2"
      shift; shift
      ;;
    -a|--action)
      ACTION="$2"
      shift; shift
      ;;
    --skip-confirm)
      SKIP_CONFIRM=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -w|--watch)
      WATCH_MODE=true
      shift
      ;;
    --health)
      HEALTH_CHECK=true
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
    -h|--help)
      echo "Usage: ./deploy.sh [options]"
      echo ""
      echo "Options:"
      echo "  -e, --environment   Set environment (development|production)"
      echo "  -n, --namespace     Set namespace"
      echo "  -a, --action        Set action (apply|delete)"
      echo "      --skip-confirm  Skip confirmation prompts"
      echo "      --dry-run       Perform a dry run"
      echo "  -w, --watch         Watch deployment progress"
      echo "      --health        Perform health check"
      echo "  -i, --interval      Watch interval in seconds (default: 5)"
      echo "  -o, --output        Output format (plain|json|yaml)"
      echo "  -h, --help          Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|production)$ ]]; then
    echo -e "${RED}Invalid environment. Must be 'development' or 'production'${NC}"
    exit 1
fi

# Validate action
if [[ ! "$ACTION" =~ ^(apply|delete)$ ]]; then
    echo -e "${RED}Invalid action. Must be 'apply' or 'delete'${NC}"
    exit 1
fi

# Ensure we have necessary privileges
ensure_sudo

# Check if secrets exist
check_secrets() {
    local secrets_file="../environments/$ENVIRONMENT/secrets.yaml"
    if [ ! -f "$secrets_file" ]; then
        echo -e "${RED}Error: Secrets file not found: $secrets_file${NC}"
        echo -e "${YELLOW}Please create secrets file from secrets.example.yaml${NC}"
        exit 1
    fi
}

# Function to confirm action
confirm_action() {
    if [ "$SKIP_CONFIRM" = true ]; then
        return 0
    fi
    
    echo -e "${YELLOW}Warning: You are about to $ACTION resources in the $ENVIRONMENT environment${NC}"
    echo -e "Namespace: $NAMESPACE"
    echo -e "Is this correct? [y/N] "
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Operation cancelled"
        exit 0
    fi
}

# Function to watch deployment progress
watch_deployment() {
    local deployment=$1
    echo -e "${BLUE}Watching deployment: $deployment${NC}"
    
    while true; do
        local status=$(kubectl_with_sudo rollout status deployment/$deployment -n $NAMESPACE 2>/dev/null)
        local ready=$(kubectl_with_sudo get deployment $deployment -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
        local desired=$(kubectl_with_sudo get deployment $deployment -n $NAMESPACE -o jsonpath='{.spec.replicas}' 2>/dev/null)
        
        echo -e "\rPods ready: $ready/$desired" >&2
        
        if [[ "$status" == *"successfully rolled out"* ]]; then
            echo -e "\n${GREEN}✓ Deployment complete${NC}"
            break
        fi
        sleep 2
    done
}

# Function to check deployment health
check_deployment_health() {
    local deployment=$1
    echo -e "${BLUE}Checking health for $deployment...${NC}"
    
    # Check pod status
    local pod=$(kubectl_with_sudo get pod -n $NAMESPACE -l app=$deployment -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -z "$pod" ]; then
        echo -e "${RED}✗ No pods found for $deployment${NC}"
        return 1
    fi

    # Check pod readiness
    if ! kubectl_with_sudo get pod $pod -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' | grep -q "True"; then
        echo -e "${RED}✗ Pod is not ready${NC}"
        if [ "$OUTPUT_FORMAT" = "plain" ]; then
            kubectl_with_sudo describe pod $pod -n $NAMESPACE
        fi
        return 1
    fi

    # Check health endpoint if available
    if kubectl_with_sudo exec $pod -n $NAMESPACE -- curl -s localhost:8080/health &>/dev/null; then
        echo -e "${GREEN}✓ Health check passed${NC}"
    else
        echo -e "${YELLOW}⚠ Health endpoint not available${NC}"
    fi

    # Show resource usage
    echo -e "\n${BLUE}Resource Usage:${NC}"
    kubectl_with_sudo top pod $pod -n $NAMESPACE 2>/dev/null || echo -e "${YELLOW}Metrics not available${NC}"
    
    return 0
}

# Function to monitor resources
monitor_resources() {
    echo -e "${BLUE}Monitoring resources in namespace $NAMESPACE...${NC}"
    while true; do
        clear
        echo -e "${BLUE}Deployment Status ($(date '+%Y-%m-%d %H:%M:%S')):${NC}"
        kubectl_with_sudo get deployments -n $NAMESPACE
        echo -e "\n${BLUE}Pod Status:${NC}"
        kubectl_with_sudo get pods -n $NAMESPACE
        echo -e "\n${BLUE}Resource Usage:${NC}"
        kubectl_with_sudo top pods -n $NAMESPACE 2>/dev/null || echo -e "${YELLOW}Metrics not available${NC}"
        sleep "$WATCH_INTERVAL"
    done
}

# Main deployment function
deploy() {
    local dry_run_flag=""
    if [ "$DRY_RUN" = true ]; then
        dry_run_flag="--dry-run=client"
        echo -e "${YELLOW}Performing dry run...${NC}"
    fi

    # Create namespace if it doesn't exist
    if [[ "$ACTION" == "apply" ]]; then
        echo "Creating namespace if it doesn't exist..."
        kubectl_with_sudo create namespace $NAMESPACE --dry-run=client -o yaml | kubectl_with_sudo $ACTION -f - $dry_run_flag
    fi

    # Apply/Delete Kubernetes configurations
    echo -e "\nPerforming $ACTION for $ENVIRONMENT environment..."
    if ! kustomize build ../overlays/$ENVIRONMENT | kubectl_with_sudo $ACTION -f - $dry_run_flag; then
        echo -e "${RED}Error: Deployment failed${NC}"
        exit 1
    fi

    if [ "$DRY_RUN" = true ]; then
        return
    fi

    if [[ "$ACTION" == "apply" ]]; then
        # Wait for deployments to be ready
        echo -e "\n${YELLOW}Waiting for deployments to be ready...${NC}"
        local deployments=$(kubectl_with_sudo get deployments -n $NAMESPACE -o jsonpath='{.items[*].metadata.name}')
        for deployment in $deployments; do
            if [ "$WATCH_MODE" = true ]; then
                watch_deployment "$deployment"
            else
                kubectl_with_sudo rollout status deployment/$deployment -n $NAMESPACE
            fi
        done

        # Check deployment health if requested
        if [ "$HEALTH_CHECK" = true ]; then
            for deployment in $deployments; do
                check_deployment_health "$deployment"
            done
        fi

        # Show endpoints
        echo -e "\n${GREEN}Service endpoints:${NC}"
        kubectl_with_sudo get ingress -n $NAMESPACE
        
        if [[ "$ENVIRONMENT" == "development" ]]; then
            echo -e "\n${GREEN}Development environment is ready!${NC}"
            echo -e "${YELLOW}Add the following to your /etc/hosts file:${NC}"
            echo "127.0.0.1    api.mankahi.local monitoring.mankahi.local"
        else
            echo -e "\n${GREEN}Production environment is ready!${NC}"
        fi
    else
        echo -e "\n${GREEN}Resources in $ENVIRONMENT environment have been deleted${NC}"
    fi
}

# Main execution
check_secrets
confirm_action
deploy

# Watch resources if requested
if [ "$WATCH_MODE" = true ] && [ "$ACTION" == "apply" ] && [ "$DRY_RUN" = false ]; then
    monitor_resources
fi
