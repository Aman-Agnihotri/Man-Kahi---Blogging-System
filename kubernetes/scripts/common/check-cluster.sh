#!/bin/bash

# Source sudo helper functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/sudo-helper.sh"

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to check if kubectl is installed
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}Error: kubectl is not installed${NC}"
        echo "Please install kubectl first:"
        echo "  - For Ubuntu: sudo snap install kubectl"
        echo "  - For macOS: brew install kubernetes-cli"
        echo "  - For Windows: choco install kubernetes-cli"
        return 1
    fi
    
    # Check kubectl version
    echo -e "${BLUE}Kubectl version:${NC}"
    kubectl_with_sudo version --client 2>/dev/null || echo -e "${YELLOW}Unable to get kubectl version${NC}"
    return 0
}

# Function to check if Docker is running
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        echo "Please install Docker first:"
        echo "  - For Ubuntu: sudo apt-get install docker.io"
        echo "  - For macOS: brew install --cask docker"
        echo "  - For Windows: Install Docker Desktop"
        return 1
    fi

    if ! docker_with_sudo info &>/dev/null; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        echo "Please start Docker:"
        echo "  - For Ubuntu: sudo systemctl start docker"
        echo "  - For macOS/Windows: Start Docker Desktop"
        return 1
    fi
    return 0
}

# Function to check if minikube is installed and running
check_minikube() {
    if ! command -v minikube &> /dev/null; then
        echo -e "${YELLOW}Minikube is not installed${NC}"
        echo "To install minikube:"
        echo "  - For Ubuntu: curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64"
        echo "                sudo install minikube-linux-amd64 /usr/local/bin/minikube"
        echo "  - For macOS: brew install minikube"
        echo "  - For Windows: choco install minikube"
        return 1
    fi

    if ! minikube_with_sudo status &>/dev/null; then
        echo -e "${YELLOW}Minikube is not running${NC}"
        echo "To start minikube:"
        echo "  sudo minikube start"
        return 1
    fi
    return 0
}

# Function to check kind cluster
check_kind() {
    if ! command -v kind &> /dev/null; then
        echo -e "${YELLOW}Kind is not installed${NC}"
        echo "To install kind:"
        echo "  - For Ubuntu/macOS: brew install kind"
        echo "  - For Windows: choco install kind"
        return 1
    fi

    if ! kind_with_sudo get clusters &>/dev/null; then
        echo -e "${YELLOW}No kind clusters found${NC}"
        echo "To create a kind cluster:"
        echo "  sudo kind create cluster --name mankahi"
        return 1
    fi
    return 0
}

# Function to check kubeconfig existence and context
check_kubeconfig() {
    local kubeconfig="${KUBECONFIG:-$HOME/.kube/config}"
    if [ ! -f "$kubeconfig" ]; then
        echo -e "${RED}Error: No kubeconfig found${NC}"
        echo "Please ensure your kubeconfig is properly set up:"
        echo "1. Check if \$KUBECONFIG environment variable is set"
        echo "2. Or ensure ~/.kube/config exists"
        echo ""
        echo "To set up a local development cluster:"
        echo "1. Using Minikube:"
        echo "   sudo minikube start"
        echo ""
        echo "2. Using Kind:"
        echo "   sudo kind create cluster --name mankahi"
        echo ""
        echo "3. Using Docker Desktop:"
        echo "   - Enable Kubernetes in Docker Desktop settings"
        return 1
    fi

    # Check current context
    local current_context=$(kubectl_with_sudo config current-context 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo -e "${BLUE}Current context:${NC} $current_context"
    else
        echo -e "${RED}Error: No current context set${NC}"
        echo "Available contexts:"
        kubectl_with_sudo config get-contexts || echo "No contexts found"
        return 1
    fi
    return 0
}

# Function to check cluster connectivity with detailed diagnostics
check_cluster_connection() {
    local timeout=$1
    [ -z "$timeout" ] && timeout=5

    echo -e "${YELLOW}Checking cluster connectivity...${NC}"
    
    # Check if cluster is running locally
    local is_local=false
    if minikube_with_sudo status &>/dev/null || kind_with_sudo get clusters &>/dev/null || \
       docker_with_sudo info &>/dev/null && [ -d "$HOME/.docker/desktop/kube" ]; then
        is_local=true
    fi

    # Try cluster-info with timeout
    if ! timeout $timeout kubectl_with_sudo cluster-info &>/dev/null; then
        echo -e "${RED}Error: Cannot connect to Kubernetes cluster${NC}"
        echo -e "${YELLOW}Diagnostics:${NC}"

        # Check if API server is accessible
        local api_url=$(kubectl_with_sudo config view -o jsonpath='{.clusters[?(@.name=="'$(kubectl_with_sudo config current-context 2>/dev/null)'")].cluster.server}')
        echo "API Server URL: $api_url"

        if [[ $api_url == *"localhost"* ]] || [[ $api_url == *"127.0.0.1"* ]]; then
            echo -e "${YELLOW}Local cluster detected${NC}"
            echo -e "\nChecking local cluster options:"
            
            if check_docker; then
                echo -e "${GREEN}✓ Docker is running${NC}"
                if [ -d "$HOME/.docker/desktop/kube" ]; then
                    echo "Docker Desktop Kubernetes status:"
                    kubectl_with_sudo config get-contexts docker-desktop &>/dev/null && \
                    echo -e "${GREEN}✓ Docker Desktop Kubernetes is available${NC}" || \
                    echo -e "${YELLOW}⚠ Docker Desktop Kubernetes is not enabled${NC}"
                fi
            else
                echo -e "${RED}✗ Docker is not running${NC}"
            fi

            echo -e "\nChecking Minikube:"
            if check_minikube; then
                echo -e "${GREEN}✓ Minikube is running${NC}"
            else
                echo -e "${YELLOW}⚠ Minikube is not running${NC}"
            fi

            echo -e "\nChecking Kind:"
            if check_kind; then
                echo -e "${GREEN}✓ Kind cluster is available${NC}"
            else
                echo -e "${YELLOW}⚠ No Kind clusters found${NC}"
            fi

            echo -e "\nTo start a local cluster, you can:"
            echo "1. Enable Kubernetes in Docker Desktop"
            echo "2. Run: sudo minikube start"
            echo "3. Run: sudo kind create cluster --name mankahi"
        else
            echo -e "\nRemote cluster connection troubleshooting:"
            echo "1. Check VPN connection if cluster is behind VPN"
            echo "2. Verify cluster certificates have not expired"
            echo "3. Check network connectivity to $api_url"
            echo "4. Verify firewall rules allow connection to API server"
        fi

        echo -e "\nAdditional troubleshooting steps:"
        echo "1. Run 'sudo kubectl cluster-info dump' for detailed diagnostics"
        echo "2. Check 'sudo kubectl config view' for current configuration"
        echo "3. Verify cluster credentials are still valid"
        return 1
    fi
    
    echo -e "${GREEN}✓ Successfully connected to Kubernetes cluster${NC}"
    return 0
}

# Function to check namespace existence
check_namespace() {
    local namespace=$1
    if ! kubectl_with_sudo get namespace "$namespace" &>/dev/null; then
        echo -e "${RED}Error: Namespace '$namespace' does not exist${NC}"
        echo "To create the namespace:"
        echo "  sudo kubectl create namespace $namespace"
        return 1
    fi
    return 0
}

# Main check function that runs all verifications
verify_cluster_access() {
    local namespace=$1
    local timeout=$2

    # Ensure we have necessary privileges
    ensure_sudo

    # Print system information
    echo -e "${BLUE}System Information:${NC}"
    echo "OS: $(uname -s)"
    echo "Architecture: $(uname -m)"
    echo "Date: $(date)"
    echo

    # Check prerequisites
    check_kubectl || return 1
    check_kubeconfig || return 1
    check_cluster_connection "$timeout" || return 1

    # Check namespace if provided
    if [ ! -z "$namespace" ]; then
        check_namespace "$namespace" || return 1
    fi

    return 0
}

# If script is run directly, show help
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "This script is meant to be sourced by other scripts."
    echo "Usage:"
    echo "  source $(basename "${BASH_SOURCE[0]}")"
    echo "  verify_cluster_access [namespace] [timeout]"
    echo ""
    echo "To manually check cluster access:"
    echo "  ./$(basename "${BASH_SOURCE[0]}") check"
    if [ "$1" = "check" ]; then
        verify_cluster_access
    fi
    exit 1
fi
