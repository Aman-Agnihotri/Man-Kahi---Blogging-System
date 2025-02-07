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

# Default values
NAMESPACE="mankahi"
CLEANUP_LEVEL=1  # 1=stop, 2=cleanup, 3=destroy
SKIP_CONFIRM=false
CREATE_BACKUP=false
BACKUP_DIR="/var/backups/mankahi"
S3_BUCKET=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      NAMESPACE="$2"
      shift; shift
      ;;
    -l|--level)
      CLEANUP_LEVEL="$2"
      shift; shift
      ;;
    --skip-confirm)
      SKIP_CONFIRM=true
      shift
      ;;
    --backup)
      CREATE_BACKUP=true
      shift
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift; shift
      ;;
    --s3-bucket)
      S3_BUCKET="$2"
      shift; shift
      ;;
    -h|--help)
      echo "Usage: ./cleanup.sh [options]"
      echo ""
      echo "Options:"
      echo "  -n, --namespace    Set namespace (default: mankahi)"
      echo "  -l, --level       Cleanup level (1=stop, 2=cleanup, 3=destroy)"
      echo "      --skip-confirm Skip confirmation prompts"
      echo "      --backup      Create backup before cleanup"
      echo "      --backup-dir  Backup directory (default: /var/backups/mankahi)"
      echo "      --s3-bucket   S3 bucket for backup storage"
      echo "  -h, --help        Show this help message"
      echo ""
      echo "Cleanup Levels:"
      echo "  1 - Stop: Scale down deployments to 0"
      echo "  2 - Cleanup: Remove deployments and release resources"
      echo "  3 - Destroy: Complete cluster cleanup including storage"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate cleanup level
if [[ ! "$CLEANUP_LEVEL" =~ ^[1-3]$ ]]; then
    echo -e "${RED}Invalid cleanup level. Must be 1, 2, or 3${NC}"
    exit 1
fi

# Ensure we have necessary privileges
ensure_sudo

# Function to get cluster type
get_cluster_type() {
    if minikube_with_sudo status &>/dev/null; then
        echo "minikube"
    elif kind_with_sudo get clusters | grep -q "mankahi"; then
        echo "kind"
    elif kubectl_with_sudo config current-context | grep -q "docker-desktop"; then
        echo "docker-desktop"
    else
        echo "unknown"
    fi
}

# Function to create backup
create_backup() {
    local date=$(date +%Y%m%d_%H%M%S)
    local backup_path="${BACKUP_DIR}/${date}"
    
    echo -e "${BLUE}Creating backup in ${backup_path}...${NC}"
    mkdir -p "$backup_path"

    # Backup Kubernetes resources
    echo "Backing up Kubernetes resources..."
    local resources=("configmap" "secret" "deployment" "service" "ingress" "pvc")
    for resource in "${resources[@]}"; do
        kubectl_with_sudo get $resource -n $NAMESPACE -o yaml > "${backup_path}/${resource}s.yaml" 2>/dev/null || true
    done

    # Backup PostgreSQL if available
    local pg_pod=$(kubectl_with_sudo get pod -n $NAMESPACE -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ ! -z "$pg_pod" ]; then
        echo "Backing up PostgreSQL database..."
        kubectl_with_sudo exec $pg_pod -n $NAMESPACE -- pg_dumpall -U postgres > "${backup_path}/postgres_backup.sql" 2>/dev/null || \
        echo -e "${YELLOW}PostgreSQL backup failed${NC}"
    fi

    # Compress backup
    cd "${BACKUP_DIR}"
    tar -czf "mankahi_backup_${date}.tar.gz" "${date}"
    rm -rf "${date}"

    # Upload to S3 if bucket specified
    if [ ! -z "$S3_BUCKET" ]; then
        echo "Uploading backup to S3..."
        if aws s3 cp "mankahi_backup_${date}.tar.gz" "s3://${S3_BUCKET}/"; then
            echo -e "${GREEN}Backup uploaded to S3 successfully${NC}"
        else
            echo -e "${RED}S3 upload failed${NC}"
        fi
    fi

    echo -e "${GREEN}Backup created: ${BACKUP_DIR}/mankahi_backup_${date}.tar.gz${NC}"
}

# Function to confirm action
confirm_action() {
    if [ "$SKIP_CONFIRM" = true ]; then
        return 0
    fi

    local message="$1"
    echo -e "${YELLOW}Warning: $message${NC}"
    echo -e "Are you sure you want to continue? [y/N] "
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Operation cancelled"
        exit 0
    fi
}

# Function to scale down deployments
scale_down_deployments() {
    echo -e "${BLUE}Scaling down deployments...${NC}"
    
    local deployments=$(kubectl_with_sudo get deployments -n $NAMESPACE -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
    
    for deployment in $deployments; do
        echo -e "Scaling down $deployment..."
        kubectl_with_sudo scale deployment $deployment --replicas=0 -n $NAMESPACE
    done
}

# Function to cleanup resources
cleanup_resources() {
    echo -e "${BLUE}Cleaning up resources...${NC}"
    
    local resources=(
        "ingress"
        "service"
        "deployment"
        "configmap"
        "secret"
    )

    for resource in "${resources[@]}"; do
        echo -e "Deleting $resource resources..."
        kubectl_with_sudo delete $resource --all -n $NAMESPACE
    done
}

# Function to cleanup storage
cleanup_storage() {
    echo -e "${BLUE}Cleaning up storage...${NC}"

    # Delete PVCs
    echo "Deleting PersistentVolumeClaims..."
    kubectl_with_sudo delete pvc --all -n $NAMESPACE

    # Wait for PVCs to be deleted
    kubectl_with_sudo wait --for=delete pvc --all -n $NAMESPACE --timeout=60s 2>/dev/null || true

    # Delete orphaned PVs
    echo "Deleting orphaned PersistentVolumes..."
    kubectl_with_sudo get pv -o json | jq -r '.items[] | select(.status.phase == "Released") | .metadata.name' | \
    while read pv; do
        kubectl_with_sudo delete pv $pv
    done
}

# Function to destroy cluster
destroy_cluster() {
    local cluster_type=$(get_cluster_type)
    
    echo -e "${BLUE}Destroying cluster ($cluster_type)...${NC}"
    
    case $cluster_type in
        "minikube")
            minikube_with_sudo stop
            minikube_with_sudo delete
            ;;
        "kind")
            kind_with_sudo delete cluster --name mankahi
            ;;
        "docker-desktop")
            echo -e "${YELLOW}Note: For Docker Desktop, please disable Kubernetes in Docker Desktop settings${NC}"
            ;;
        *)
            echo -e "${RED}Unknown cluster type. Manual cleanup may be required${NC}"
            ;;
    esac
}

# Main execution
echo -e "${BLUE}Starting cleanup process (Level $CLEANUP_LEVEL)...${NC}"

# Verify cluster access
if ! verify_cluster_access "$NAMESPACE" 10; then
    exit 1
fi

# Create backup if requested
if [ "$CREATE_BACKUP" = true ]; then
    create_backup
fi

# Level 1: Stop - Scale down deployments
if [ $CLEANUP_LEVEL -ge 1 ]; then
    confirm_action "This will scale down all deployments in namespace $NAMESPACE"
    scale_down_deployments
fi

# Level 2: Cleanup - Remove deployments and resources
if [ $CLEANUP_LEVEL -ge 2 ]; then
    confirm_action "This will delete all deployments and resources in namespace $NAMESPACE"
    cleanup_resources
fi

# Level 3: Destroy - Complete cleanup including storage
if [ $CLEANUP_LEVEL -ge 3 ]; then
    confirm_action "This will perform a complete cleanup, including storage and cluster (if local)"
    cleanup_storage
    
    # If it's a local development cluster, offer to destroy it
    if [[ $(get_cluster_type) != "unknown" ]]; then
        confirm_action "Would you like to destroy the local cluster?"
        destroy_cluster
    fi
fi

# Print completion message
case $CLEANUP_LEVEL in
    1)
        echo -e "${GREEN}Successfully scaled down all deployments${NC}"
        echo "To restart deployments:"
        echo "sudo ./deploy.sh -e development"
        ;;
    2)
        echo -e "${GREEN}Successfully cleaned up all resources${NC}"
        echo "To redeploy the application:"
        echo "1. sudo ./deploy.sh -e development"
        echo "2. sudo ./deploy.sh -e development --health"
        ;;
    3)
        echo -e "${GREEN}Successfully performed complete cleanup${NC}"
        echo "To start fresh:"
        echo "1. sudo ./setup-local-cluster.sh"
        echo "2. sudo ./deploy.sh -e development"
        ;;
esac
