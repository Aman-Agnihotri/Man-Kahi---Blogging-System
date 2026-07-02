#!/bin/bash
# Backs up the ManKahi Postgres database from a running container using
# pg_dump's custom format (compatible with restore-postgres.sh's
# pg_restore). Reads POSTGRES_USER/POSTGRES_DB from inside the container
# itself (already set there via env_file) rather than parsing host-side
# .env files, so this works the same way regardless of which env file was
# actually used to start the stack.
set -euo pipefail

ENVIRONMENT="development"
OUTPUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups"

show_help() {
    echo "Usage: $0 [-e development|production] [-o output-dir]"
    echo ""
    echo "  -e, --environment   Target environment [default: development]"
    echo "  -o, --output-dir    Directory to write the backup file into [default: docker/backups]"
    echo "  -h, --help          Show this help message"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            [[ "$ENVIRONMENT" =~ ^(development|production)$ ]] || { echo "Error: environment must be 'development' or 'production'"; exit 1; }
            shift 2
            ;;
        -o|--output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo "Error: unknown option $1"
            show_help
            ;;
    esac
done

CONTAINER="mankahi-postgres"
[[ "$ENVIRONMENT" == "production" ]] && CONTAINER="mankahi-postgres-prod"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Error: container '$CONTAINER' is not running. Start the stack first." >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="$OUTPUT_DIR/mankahi-${ENVIRONMENT}-${TIMESTAMP}.dump"

echo "Backing up $CONTAINER to $OUTPUT_FILE ..."
docker exec "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$OUTPUT_FILE"

SIZE="$(du -h "$OUTPUT_FILE" | cut -f1)"
echo "Backup complete: $OUTPUT_FILE ($SIZE)"
echo "Restore with: docker/scripts/restore-postgres.sh $OUTPUT_FILE -e $ENVIRONMENT"
