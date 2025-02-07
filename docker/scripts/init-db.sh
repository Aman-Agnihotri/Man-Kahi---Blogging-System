#!/bin/bash
set -e

# This script creates a single database along with its user, using the
# environment variables POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB.

# Execute psql commands as the postgres superuser
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    -- Check if the database exists, and create it if it doesn't
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB') THEN
            CREATE DATABASE "$POSTGRES_DB" WITH OWNER="$POSTGRES_USER";
        END IF;
    END
    \$\$;

    -- Grant all privileges to ensure proper access
    GRANT ALL PRIVILEGES ON DATABASE "$POSTGRES_DB" TO "$POSTGRES_USER";
    
    -- Connect to the database and create extensions if needed
    \c "$POSTGRES_DB";
    
    -- Add any additional setup here, like creating extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOSQL
