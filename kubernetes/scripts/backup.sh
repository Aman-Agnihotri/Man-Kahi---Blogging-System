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
NC='\033[0m'

# Set default values
NAMESPACE="mankahi"
BACKUP_DIR="/var/backups/mankahi"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30
COMPRESS_ONLY=false
S3_BUCKET=""
COMPONENTS="all"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      NAMESPACE="$2"
      shift; shift
      ;;
    -d|--directory)
      BACKUP_DIR="$2"
      shift; shift
      ;;
    -r|--retention)
      RETENTION_DAYS="$2"
      shift; shift
      ;;
    -c|--components)
      COMPONENTS="$2"
      shift; shift
      ;;
    --s3-bucket)
      S3_BUCKET="$2"
      shift; shift
      ;;
    --compress-only)
      COMPRESS_ONLY=true
      shift
      ;;
    -h|--help)
      echo "Usage: ./backup.sh [options]"
      echo ""
      echo "Options:"
      echo "  -n, --namespace     Set namespace (default: mankahi)"
      echo "  -d, --directory     Set backup directory (default: /var/backups/mankahi)"
      echo "  -r, --retention     Set retention period in days (default: 30)"
      echo "  -c, --components    Components to backup (all|postgres|elasticsearch|k8s)"
      echo "      --s3-bucket     S3 bucket for remote backup"
      echo "      --compress-only Only compress existing backups"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Check if running with sufficient privileges
if [ "$EUID" -ne 0 ] && [ "$COMPRESS_ONLY" = false ]; then
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Verify cluster access before proceeding
if [ "$COMPRESS_ONLY" = false ]; then
    if ! verify_cluster_access "$NAMESPACE" 10; then
        exit 1
    fi
fi

# Create backup directory
create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        echo -e "${YELLOW}Creating backup directory: $BACKUP_DIR${NC}"
        mkdir -p "$BACKUP_DIR"
    fi
    mkdir -p "${BACKUP_DIR}/${DATE}"
}

# Backup PostgreSQL with retries
backup_postgres() {
    echo -e "${BLUE}Backing up PostgreSQL databases...${NC}"
    
    local max_retries=3
    local retry_count=0
    local POSTGRES_POD=""
    
    while [ $retry_count -lt $max_retries ]; do
        POSTGRES_POD=$(kubectl get pod -n $NAMESPACE -l app=postgres -o jsonpath="{.items[0].metadata.name}" 2>/dev/null)
        if [ ! -z "$POSTGRES_POD" ]; then
            break
        fi
        retry_count=$((retry_count+1))
        echo -e "${YELLOW}Retry $retry_count: Waiting for PostgreSQL pod...${NC}"
        sleep 5
    done

    if [ -z "$POSTGRES_POD" ]; then
        echo -e "${RED}PostgreSQL pod not found after $max_retries attempts${NC}"
        return 1
    fi

    # Test PostgreSQL connection
    if ! kubectl exec -n $NAMESPACE $POSTGRES_POD -- pg_isready > /dev/null; then
        echo -e "${RED}PostgreSQL is not ready${NC}"
        return 1
    }

    # Perform backup with progress indication
    echo -e "${YELLOW}Starting PostgreSQL dump...${NC}"
    if kubectl exec -n $NAMESPACE $POSTGRES_POD -- pg_dumpall -U postgres > "${BACKUP_DIR}/${DATE}/postgres_backup.sql"; then
        echo -e "${GREEN}PostgreSQL backup completed successfully${NC}"
        # Create MD5 checksum
        md5sum "${BACKUP_DIR}/${DATE}/postgres_backup.sql" > "${BACKUP_DIR}/${DATE}/postgres_backup.md5"
        return 0
    else
        echo -e "${RED}PostgreSQL backup failed${NC}"
        return 1
    fi
}

# Backup Elasticsearch with retries
backup_elasticsearch() {
    echo -e "${BLUE}Creating Elasticsearch snapshot...${NC}"
    
    local max_retries=3
    local retry_count=0
    local ES_POD=""
    
    while [ $retry_count -lt $max_retries ]; do
        ES_POD=$(kubectl get pod -n $NAMESPACE -l app=elasticsearch -o jsonpath="{.items[0].metadata.name}" 2>/dev/null)
        if [ ! -z "$ES_POD" ]; then
            break
        fi
        retry_count=$((retry_count+1))
        echo -e "${YELLOW}Retry $retry_count: Waiting for Elasticsearch pod...${NC}"
        sleep 5
    done

    if [ -z "$ES_POD" ]; then
        echo -e "${RED}Elasticsearch pod not found after $max_retries attempts${NC}"
        return 1
    }

    # Check cluster health
    local health=$(kubectl exec -n $NAMESPACE $ES_POD -- curl -s "localhost:9200/_cluster/health" | jq -r '.status' 2>/dev/null)
    if [ "$health" = "red" ]; then
        echo -e "${RED}Elasticsearch cluster is unhealthy${NC}"
        return 1
    fi

    # Register snapshot repository
    echo -e "${YELLOW}Registering snapshot repository...${NC}"
    kubectl exec -n $NAMESPACE $ES_POD -- curl -X PUT "localhost:9200/_snapshot/backup" -H 'Content-Type: application/json' -d'
    {
      "type": "fs",
      "settings": {
        "location": "/usr/share/elasticsearch/backup"
      }
    }'

    # Create snapshot with retry mechanism
    local retries=3
    while [ $retries -gt 0 ]; do
        if kubectl exec -n $NAMESPACE $ES_POD -- curl -X PUT "localhost:9200/_snapshot/backup/snapshot_${DATE}?wait_for_completion=true"; then
            echo -e "${GREEN}Elasticsearch snapshot created successfully${NC}"
            return 0
        else
            retries=$((retries-1))
            if [ $retries -eq 0 ]; then
                echo -e "${RED}Elasticsearch snapshot failed after 3 attempts${NC}"
                return 1
            fi
            echo -e "${YELLOW}Retrying Elasticsearch snapshot...${NC}"
            sleep 5
        fi
    done
}

# Backup Kubernetes resources
backup_kubernetes() {
    echo -e "${BLUE}Backing up Kubernetes resources...${NC}"
    
    local resources=(
        "configmap"
        "secret"
        "pvc"
        "service"
        "deployment"
        "ingress"
    )

    for resource in "${resources[@]}"; do
        echo -e "${YELLOW}Backing up $resource...${NC}"
        if kubectl get $resource -n $NAMESPACE -o yaml > "${BACKUP_DIR}/${DATE}/${resource}s.yaml"; then
            echo -e "${GREEN}✓ $resource backup completed${NC}"
        else
            echo -e "${RED}✗ $resource backup failed${NC}"
        fi
    done
}

# Compress backup with error handling
compress_backup() {
    echo -e "${BLUE}Compressing backup...${NC}"
    cd "${BACKUP_DIR}"
    if tar -czf "mankahi_backup_${DATE}.tar.gz" "${DATE}"; then
        echo -e "${GREEN}Backup compressed successfully${NC}"
        rm -rf "${DATE}"
    else
        echo -e "${RED}Backup compression failed${NC}"
        return 1
    fi
}

# Upload to S3 with retry mechanism
upload_to_s3() {
    if [ -n "$S3_BUCKET" ]; then
        echo -e "${BLUE}Uploading backup to S3...${NC}"
        local retries=3
        while [ $retries -gt 0 ]; do
            if aws s3 cp "${BACKUP_DIR}/mankahi_backup_${DATE}.tar.gz" "s3://${S3_BUCKET}/"; then
                echo -e "${GREEN}Backup uploaded to S3 successfully${NC}"
                return 0
            else
                retries=$((retries-1))
                if [ $retries -eq 0 ]; then
                    echo -e "${RED}S3 upload failed after 3 attempts${NC}"
                    return 1
                fi
                echo -e "${YELLOW}Retrying S3 upload...${NC}"
                sleep 5
            fi
        done
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    echo -e "${BLUE}Cleaning up old backups...${NC}"
    find "$BACKUP_DIR" -name "mankahi_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
    if [ -n "$S3_BUCKET" ]; then
        aws s3 ls "s3://${S3_BUCKET}" | while read -r line; do
            createDate=$(echo $line | awk {'print $1" "$2'})
            createDate=$(date -d "$createDate" +%s)
            olderThan=$(date -d "-$RETENTION_DAYS days" +%s)
            if [[ $createDate -lt $olderThan ]]; then
                fileName=$(echo $line | awk {'print $4'})
                if [[ $fileName == mankahi_backup_* ]]; then
                    aws s3 rm "s3://${S3_BUCKET}/${fileName}"
                fi
            fi
        done
    fi
}

# Main execution
echo -e "${BLUE}Starting backup process - $(date)${NC}"
echo -e "${YELLOW}Backup location: ${BACKUP_DIR}${NC}"

create_backup_dir

if [ "$COMPRESS_ONLY" = false ]; then
    if [[ "$COMPONENTS" =~ ^(all|postgres)$ ]]; then
        backup_postgres || echo -e "${RED}PostgreSQL backup failed${NC}"
    fi
    
    if [[ "$COMPONENTS" =~ ^(all|elasticsearch)$ ]]; then
        backup_elasticsearch || echo -e "${RED}Elasticsearch backup failed${NC}"
    fi
    
    if [[ "$COMPONENTS" =~ ^(all|k8s)$ ]]; then
        backup_kubernetes || echo -e "${RED}Kubernetes resources backup failed${NC}"
    fi
fi

compress_backup
upload_to_s3
cleanup_old_backups

echo -e "${GREEN}Backup completed - $(date)${NC}"
echo -e "${YELLOW}Backup location: ${BACKUP_DIR}/mankahi_backup_${DATE}.tar.gz${NC}"
