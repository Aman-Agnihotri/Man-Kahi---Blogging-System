#!/bin/bash
# Restores a ManKahi Postgres backup (created by backup-postgres.sh) into a
# running container. Destructive: --clean drops existing objects covered
# by the dump before recreating them. Requires confirmation unless --force
# is passed.
set -euo pipefail

ENVIRONMENT="development"
FORCE=false
BACKUP_FILE=""

show_help() {
    echo "Usage: $0 <backup-file> [-e development|production] [--force]"
    echo ""
    echo "  -e, --environment   Target environment [default: development]"
    echo "  --force             Skip the confirmation prompt"
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
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            if [[ -z "$BACKUP_FILE" ]]; then
                BACKUP_FILE="$1"
                shift
            else
                echo "Error: unknown option $1"
                show_help
            fi
            ;;
    esac
done

[[ -n "$BACKUP_FILE" ]] || { echo "Error: backup file is required."; show_help; }
[[ -f "$BACKUP_FILE" ]] || { echo "Error: backup file '$BACKUP_FILE' not found."; exit 1; }

CONTAINER="mankahi-postgres"
[[ "$ENVIRONMENT" == "production" ]] && CONTAINER="mankahi-postgres-prod"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Error: container '$CONTAINER' is not running. Start the stack first." >&2
    exit 1
fi

if [[ "$FORCE" != "true" ]]; then
    echo "This will overwrite the current contents of the '$ENVIRONMENT' database in '$CONTAINER' with '$BACKUP_FILE'."
    read -r -p "Type 'yes' to continue: " CONFIRM
    [[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }
fi

TMP_IN_CONTAINER="/tmp/$(basename "$BACKUP_FILE")"
echo "Copying backup into $CONTAINER ..."
docker cp "$BACKUP_FILE" "$CONTAINER:$TMP_IN_CONTAINER"

echo "Restoring ..."
docker exec "$CONTAINER" sh -c "pg_restore --clean --if-exists -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" \"$TMP_IN_CONTAINER\""
docker exec "$CONTAINER" rm -f "$TMP_IN_CONTAINER"

echo "Restore complete."
