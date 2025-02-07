#!/bin/bash

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to check if we're root
is_root() {
    [ "$EUID" -eq 0 ]
    return $?
}

# Function to check if sudo is available
has_sudo() {
    command -v sudo &> /dev/null
    return $?
}

# Function to check if user has sudo rights
can_sudo() {
    if has_sudo; then
        sudo -n true 2>/dev/null
        return $?
    fi
    return 1
}

# Function to ensure we can execute privileged commands
ensure_sudo() {
    if is_root; then
        return 0
    elif ! has_sudo; then
        echo -e "${RED}Error: This script requires root privileges, but sudo is not installed${NC}"
        echo "Please either:"
        echo "1. Run this script as root"
        echo "2. Install sudo and add your user to sudoers"
        exit 1
    elif ! can_sudo; then
        echo -e "${YELLOW}This script requires sudo privileges${NC}"
        if ! sudo -v; then
            echo -e "${RED}Error: Failed to obtain sudo privileges${NC}"
            exit 1
        fi
    fi
}

# Function to execute command with sudo if needed
run_with_sudo() {
    if is_root; then
        "$@"
    else
        sudo "$@"
    fi
}

# Function to execute docker command with sudo if needed
docker_with_sudo() {
    if is_root || groups | grep -q docker; then
        docker "$@"
    else
        sudo docker "$@"
    fi
}

# Function to execute kubectl command with sudo if needed
kubectl_with_sudo() {
    # Check if .kube/config exists and is owned by current user
    local kubeconfig="${KUBECONFIG:-$HOME/.kube/config}"
    if [ -f "$kubeconfig" ] && [ "$(stat -c '%U' "$kubeconfig")" = "$(whoami)" ]; then
        kubectl "$@"
    else
        sudo kubectl "$@"
    fi
}

# Function to handle minikube commands
minikube_with_sudo() {
    if is_root; then
        minikube "$@"
    else
        sudo minikube "$@"
    fi
}

# Function to handle kind commands
kind_with_sudo() {
    if is_root || groups | grep -q docker; then
        kind "$@"
    else
        sudo kind "$@"
    fi
}

# If script is run directly, show help
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "This script is meant to be sourced by other scripts."
    echo "Usage:"
    echo "  source $(basename "${BASH_SOURCE[0]}")"
    echo "  ensure_sudo"
    echo "  run_with_sudo command [args...]"
    echo "  docker_with_sudo command [args...]"
    echo "  kubectl_with_sudo command [args...]"
    echo ""
    echo "Example:"
    echo "  source ./sudo-helper.sh"
    echo "  ensure_sudo"
    echo "  kubectl_with_sudo get pods"
    exit 1
fi
