#!/bin/bash

# Set default values
NAMESPACE="mankahi"
BACKUP_DIR="/var/backups/mankahi"
DATE=$(date +%Y%m%d_%H%M%S)

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      NAMESPACE="$2"
      shift
      shift
      ;;
    -d|--directory)
      BACKUP_DIR="$2"
      shift
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}/${DATE}"

# Backup PostgreSQL databases
echo "Backing up PostgreSQL databases..."
POSTGRES_POD=$(kubectl get pod -n $NAMESPACE -l app=postgres -o jsonpath="{.items[0].metadata.name}")
if [ -n "$POSTGRES_POD" ]; then
    kubectl exec -n $NAMESPACE $POSTGRES_POD -- pg_dumpall -U postgres > "${BACKUP_DIR}/${DATE}/postgres_backup.sql"
    if [ $? -eq 0 ]; then
        echo "PostgreSQL backup completed successfully"
    else
        echo "PostgreSQL backup failed"
    fi
else
    echo "PostgreSQL pod not found"
fi

# Backup Elasticsearch indices
echo "Creating Elasticsearch snapshot..."
ES_POD=$(kubectl get pod -n $NAMESPACE -l app=elasticsearch -o jsonpath="{.items[0].metadata.name}")
if [ -n "$ES_POD" ]; then
    # Register snapshot repository if not exists
    kubectl exec -n $NAMESPACE $ES_POD -- curl -X PUT "localhost:9200/_snapshot/backup" -H 'Content-Type: application/json' -d'
    {
      "type": "fs",
      "settings": {
        "location": "/usr/share/elasticsearch/backup"
      }
    }'

    # Create snapshot
    kubectl exec -n $NAMESPACE $ES_POD -- curl -X PUT "localhost:9200/_snapshot/backup/snapshot_${DATE}?wait_for_completion=true"
    
    if [ $? -eq 0 ]; then
        echo "Elasticsearch snapshot created successfully"
    else
        echo "Elasticsearch snapshot failed"
    fi
else
    echo "Elasticsearch pod not found"
fi

# Backup Kubernetes configurations
echo "Backing up Kubernetes configurations..."

# Backup all ConfigMaps
kubectl get configmap -n $NAMESPACE -o yaml > "${BACKUP_DIR}/${DATE}/configmaps.yaml"

# Backup all Secrets (encrypted)
kubectl get secret -n $NAMESPACE -o yaml > "${BACKUP_DIR}/${DATE}/secrets.yaml"

# Backup PersistentVolumeClaims
kubectl get pvc -n $NAMESPACE -o yaml > "${BACKUP_DIR}/${DATE}/pvcs.yaml"

# Backup Service definitions
kubectl get service -n $NAMESPACE -o yaml > "${BACKUP_DIR}/${DATE}/services.yaml"

# Backup Deployments
kubectl get deployment -n $NAMESPACE -o yaml > "${BACKUP_DIR}/${DATE}/deployments.yaml"

# Backup Ingress configurations
kubectl get ingress -n $NAMESPACE -o yaml > "${BACKUP_DIR}/${DATE}/ingress.yaml"

# Create tar archive
cd "${BACKUP_DIR}"
tar -czf "mankahi_backup_${DATE}.tar.gz" "${DATE}"
rm -rf "${DATE}"

echo "Backup completed successfully"
echo "Backup location: ${BACKUP_DIR}/mankahi_backup_${DATE}.tar.gz"

# Optional: Upload to remote storage
if [ -n "$REMOTE_BACKUP_URL" ]; then
    echo "Uploading backup to remote storage..."
    curl -T "${BACKUP_DIR}/mankahi_backup_${DATE}.tar.gz" "$REMOTE_BACKUP_URL"
    if [ $? -eq 0 ]; then
        echo "Remote backup completed successfully"
    else
        echo "Remote backup failed"
    fi
fi
