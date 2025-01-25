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

# Set backup directory
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

# Create backup directories
mkdir -p "${BACKUP_PATH}/databases"
mkdir -p "${BACKUP_PATH}/minio"
mkdir -p "${BACKUP_PATH}/elasticsearch"

echo -e "${YELLOW}Starting backup process...${NC}"

# Function to handle errors
handle_error() {
    echo -e "${RED}Error: $1${NC}"
    exit 1
}

# Backup PostgreSQL databases
echo "Backing up PostgreSQL databases..."
for db in mankahi_auth mankahi_blog mankahi_analytics; do
    echo "Backing up $db..."
    docker-compose -f docker-compose.prod.yml exec -T postgres \
        pg_dump -U "${POSTGRES_USER}" "${db}" > "${BACKUP_PATH}/databases/${db}.sql" || \
        handle_error "Failed to backup ${db}"
done

# Backup Redis data
echo "Backing up Redis data..."
docker-compose -f docker-compose.prod.yml exec redis redis-cli SAVE || \
    handle_error "Failed to create Redis snapshot"
docker-compose -f docker-compose.prod.yml cp redis:/data/dump.rdb "${BACKUP_PATH}/redis_dump.rdb" || \
    handle_error "Failed to copy Redis dump"

# Backup MinIO data
echo "Backing up MinIO data..."
docker-compose -f docker-compose.prod.yml exec minio \
    sh -c "mc mirror minio/mankahi-uploads /tmp/minio-backup" || \
    handle_error "Failed to backup MinIO data"
docker-compose -f docker-compose.prod.yml cp minio:/tmp/minio-backup "${BACKUP_PATH}/minio" || \
    handle_error "Failed to copy MinIO backup"

# Backup Elasticsearch indices
echo "Backing up Elasticsearch indices..."
docker-compose -f docker-compose.prod.yml exec elasticsearch \
    curl -X PUT "localhost:9200/_snapshot/backup_repository/${TIMESTAMP}?wait_for_completion=true" || \
    handle_error "Failed to create Elasticsearch snapshot"

# Create compressed archive
echo "Creating compressed archive..."
cd "${BACKUP_DIR}" || handle_error "Failed to change directory"
tar -czf "${TIMESTAMP}.tar.gz" "${TIMESTAMP}" || \
    handle_error "Failed to create compressed archive"
rm -rf "${TIMESTAMP}"

# Rotate old backups (keep last 7 days)
echo "Rotating old backups..."
find "${BACKUP_DIR}" -name "*.tar.gz" -mtime +7 -delete

# Optional: Upload to remote storage
if [ -n "${BACKUP_REMOTE_PATH}" ]; then
    echo "Uploading backup to remote storage..."
    rclone copy "${BACKUP_DIR}/${TIMESTAMP}.tar.gz" "${BACKUP_REMOTE_PATH}" || \
        echo -e "${YELLOW}Warning: Failed to upload backup to remote storage${NC}"
fi

echo -e "${GREEN}Backup completed successfully!${NC}"
echo "Backup saved to: ${BACKUP_DIR}/${TIMESTAMP}.tar.gz"

# Print backup statistics
echo -e "\n${YELLOW}Backup Statistics:${NC}"
echo "Timestamp: ${TIMESTAMP}"
echo "Size: $(du -h "${BACKUP_DIR}/${TIMESTAMP}.tar.gz" | cut -f1)"
echo "Databases backed up: mankahi_auth, mankahi_blog, mankahi_analytics"
echo "Redis snapshot: included"
echo "MinIO data: included"
echo "Elasticsearch snapshot: included"

# Print restore instructions
echo -e "\n${YELLOW}To restore this backup:${NC}"
echo "1. Extract the archive:"
echo "   tar -xzf ${TIMESTAMP}.tar.gz"
echo "2. Restore databases:"
echo "   cat databases/[database].sql | docker-compose exec -T postgres psql -U \${POSTGRES_USER} [database]"
echo "3. Restore Redis:"
echo "   docker cp redis_dump.rdb mankahi-redis-prod:/data/dump.rdb"
echo "4. Restore MinIO:"
echo "   mc mirror backup/ minio/mankahi-uploads"
echo "5. Restore Elasticsearch:"
echo "   curl -X POST localhost:9200/_snapshot/backup_repository/${TIMESTAMP}/_restore"

echo -e "\n${YELLOW}Remember to:${NC}"
echo "1. Verify backup integrity regularly"
echo "2. Test restore procedures"
echo "3. Monitor backup storage space"
echo "4. Configure remote backup storage"
