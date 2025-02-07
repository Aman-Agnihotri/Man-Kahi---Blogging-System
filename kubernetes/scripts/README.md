# Kubernetes Management Scripts

## Essential Scripts

1. `setup-local-cluster.sh`
   - Sets up local Kubernetes cluster (kind, minikube, or docker-desktop)
   - Configures necessary components
   - Usage: `sudo ./setup-local-cluster.sh -t kind`

2. `deploy.sh`
   - Deploys and manages applications
   - Monitors deployment status
   - Checks health and resource usage
   - Usage: `sudo ./deploy.sh -e development [--watch] [--health]`

3. `cleanup.sh`
   - Manages resource cleanup at different levels
   - Handles backups before cleanup
   - Usage: `sudo ./cleanup.sh -l [1-3] [--backup]`

## Common Utilities

1. `common/check-cluster.sh`
   - Core cluster validation functions
   - Connectivity checks
   - Prerequisite validation

2. `common/sudo-helper.sh`
   - Sudo privilege management
   - Command execution helpers

## Initial Setup

Make scripts executable:
```bash
chmod +x setup-local-cluster.sh deploy.sh cleanup.sh
chmod +x common/*.sh
```

## Usage Examples

1. **Start Development:**
   ```bash
   # Setup local cluster
   sudo ./setup-local-cluster.sh -t kind
   
   # Deploy application
   sudo ./deploy.sh -e development
   ```

2. **Monitor Application:**
   ```bash
   # Watch deployment status
   sudo ./deploy.sh -e development --watch
   
   # Check health
   sudo ./deploy.sh -e development --health
   ```

3. **Cleanup:**
   ```bash
   # Create backup and cleanup
   sudo ./cleanup.sh -l 2 --backup
   
   # Complete cleanup including cluster
   sudo ./cleanup.sh -l 3
