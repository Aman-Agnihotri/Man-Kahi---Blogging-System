#!/bin/bash

# Source sudo helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common/sudo-helper.sh"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Ensure we have necessary privileges
ensure_sudo

# List of scripts to make executable
SCRIPTS=(
    "deploy.sh"
    "backup.sh"
    "monitor.sh"
    "health-check.sh"
    "setup-local-cluster.sh"
    "cleanup.sh"
    "common/check-cluster.sh"
    "common/sudo-helper.sh"
    "setup-permissions.sh"
)

echo -e "${YELLOW}Setting up script permissions...${NC}"

# Make each script executable
for script in "${SCRIPTS[@]}"; do
    script_path="$SCRIPT_DIR/$script"
    if [ -f "$script_path" ]; then
        echo "Setting permissions for $script"
        # Set ownership to the actual user (not root) if running with sudo
        if [ -n "$SUDO_USER" ]; then
            run_with_sudo chown "$SUDO_USER:$(id -gn "$SUDO_USER")" "$script_path"
        fi
        # Make executable by owner and group, readable by others
        run_with_sudo chmod 755 "$script_path"
    else
        echo -e "${RED}Warning: Script not found: $script${NC}"
    fi
done

# Set up kubeconfig if needed
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
if [ ! -f "$KUBECONFIG" ]; then
    echo -e "${YELLOW}Creating .kube directory and config file...${NC}"
    mkdir -p "$(dirname "$KUBECONFIG")"
    touch "$KUBECONFIG"
    if [ -n "$SUDO_USER" ]; then
        run_with_sudo chown -R "$SUDO_USER:$(id -gn "$SUDO_USER")" "$(dirname "$KUBECONFIG")"
    fi
    run_with_sudo chmod 600 "$KUBECONFIG"
fi

echo -e "${GREEN}Permission setup complete!${NC}"
echo -e "You can now run the Kubernetes management scripts:"
echo "1. Start local cluster:   sudo ./setup-local-cluster.sh"
echo "2. Deploy application:    sudo ./deploy.sh -e development"
echo "3. Monitor resources:     sudo ./monitor.sh"
echo "4. Check health:         sudo ./health-check.sh"
echo "5. Backup data:          sudo ./backup.sh"
echo "6. Clean up resources:   sudo ./cleanup.sh"
