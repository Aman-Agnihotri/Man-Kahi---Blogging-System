#!/bin/bash

set -e  # Exit on error

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common/check-cluster.sh"
source "$SCRIPT_DIR/common/sudo-helper.sh"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
CLUSTER_TYPE="docker-desktop"  # docker-desktop, minikube, or kind
NAMESPACE="mankahi"
CREATE_NAMESPACE=true
MEMORY="4096"  # Default memory in MB
CPUS="2"       # Default CPU cores

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -t|--type)
      CLUSTER_TYPE="$2"
      shift; shift
      ;;
    -n|--namespace)
      NAMESPACE="$2"
      shift; shift
      ;;
    -m|--memory)
      MEMORY="$2"
      shift; shift
      ;;
    -c|--cpus)
      CPUS="$2"
      shift; shift
      ;;
    --no-namespace)
      CREATE_NAMESPACE=false
      shift
      ;;
    -h|--help)
      echo "Usage: ./setup-local-cluster.sh [options]"
      echo ""
      echo "Options:"
      echo "  -t, --type         Cluster type (docker-desktop|minikube|kind)"
      echo "  -n, --namespace    Set namespace (default: mankahi)"
      echo "  -m, --memory       Memory limit in MB (default: 4096)"
      echo "  -c, --cpus         Number of CPUs (default: 2)"
      echo "      --no-namespace Skip namespace creation"
      echo "  -h, --help        Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Validate cluster type
if [[ ! "$CLUSTER_TYPE" =~ ^(docker-desktop|minikube|kind)$ ]]; then
    echo -e "${RED}Invalid cluster type. Must be 'docker-desktop', 'minikube', or 'kind'${NC}"
    exit 1
fi

# Ensure we have necessary privileges
ensure_sudo

# Function to setup Docker Desktop Kubernetes
setup_docker_desktop() {
    echo -e "${BLUE}Setting up Docker Desktop Kubernetes...${NC}"
    
    # Check if Docker Desktop is installed
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker Desktop is not installed${NC}"
        echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi

    # Check if Docker is running
    if ! docker_with_sudo info &>/dev/null; then
        echo -e "${RED}Docker Desktop is not running${NC}"
        echo "Please start Docker Desktop"
        exit 1
    fi

    # Check if Kubernetes is enabled in Docker Desktop
    if ! kubectl_with_sudo config get-contexts docker-desktop &>/dev/null; then
        echo -e "${YELLOW}Kubernetes is not enabled in Docker Desktop${NC}"
        echo "Please enable Kubernetes in Docker Desktop settings:"
        echo "1. Open Docker Desktop"
        echo "2. Go to Settings -> Kubernetes"
        echo "3. Check 'Enable Kubernetes'"
        echo "4. Click 'Apply & Restart'"
        exit 1
    fi

    # Switch to docker-desktop context
    kubectl_with_sudo config use-context docker-desktop
}

# Function to setup Minikube
setup_minikube() {
    echo -e "${BLUE}Setting up Minikube...${NC}"
    
    # Check if Minikube is installed
    if ! command -v minikube &> /dev/null; then
        echo -e "${RED}Minikube is not installed${NC}"
        echo "Please install Minikube:"
        echo "  - For Ubuntu: curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64"
        echo "                sudo install minikube-linux-amd64 /usr/local/bin/minikube"
        echo "  - For macOS: brew install minikube"
        echo "  - For Windows: choco install minikube"
        exit 1
    fi

    # Start Minikube if not running
    if ! minikube_with_sudo status &>/dev/null; then
        echo "Starting Minikube..."
        minikube_with_sudo start \
            --driver=docker \
            --cpus=$CPUS \
            --memory=${MEMORY}mb \
            --addons=ingress \
            --addons=metrics-server
    fi

    # Set up local Docker registry
    minikube_with_sudo addons enable registry
}

# Function to setup Kind
setup_kind() {
    echo -e "${BLUE}Setting up Kind cluster...${NC}"
    
    # Check if Kind is installed
    if ! command -v kind &> /dev/null; then
        echo -e "${RED}Kind is not installed${NC}"
        echo "Please install Kind:"
        echo "  - For Ubuntu/macOS: brew install kind"
        echo "  - For Windows: choco install kind"
        exit 1
    fi

    # Create Kind config with ingress settings
    cat <<EOF > kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
- role: worker
  kubeadmConfigPatches:
  - |
    kind: JoinConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "node-role.kubernetes.io/worker=''"
        system-reserved: memory=512Mi
        eviction-hard: memory.available<256Mi
EOF

    # Create Kind cluster
    if ! kind_with_sudo get clusters | grep -q "mankahi"; then
        echo "Creating Kind cluster..."
        kind_with_sudo create cluster --name mankahi --config kind-config.yaml
    fi

    # Install ingress controller
    kubectl_with_sudo apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
    
    # Wait for ingress controller
    echo "Waiting for ingress controller to be ready..."
    kubectl_with_sudo wait --namespace ingress-nginx \
      --for=condition=ready pod \
      --selector=app.kubernetes.io/component=controller \
      --timeout=90s
}

# Function to setup metrics server
setup_metrics_server() {
    echo -e "${BLUE}Setting up metrics-server...${NC}"
    kubectl_with_sudo apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

    # Wait for metrics-server to be ready
    echo "Waiting for metrics-server to be ready..."
    kubectl_with_sudo wait --namespace kube-system \
      --for=condition=ready pod \
      --selector=k8s-app=metrics-server \
      --timeout=90s
}

# Function to create namespace and set context
setup_namespace() {
    if [ "$CREATE_NAMESPACE" = true ]; then
        echo -e "${BLUE}Creating namespace: $NAMESPACE${NC}"
        kubectl_with_sudo create namespace $NAMESPACE --dry-run=client -o yaml | kubectl_with_sudo apply -f -
        
        # Set the namespace in the current context
        kubectl_with_sudo config set-context --current --namespace=$NAMESPACE
    fi
}

# Main execution
echo -e "${BLUE}Setting up local Kubernetes cluster...${NC}"

# Setup selected cluster type
case $CLUSTER_TYPE in
    "docker-desktop")
        setup_docker_desktop
        ;;
    "minikube")
        setup_minikube
        ;;
    "kind")
        setup_kind
        ;;
esac

# Verify cluster access
if ! verify_cluster_access; then
    echo -e "${RED}Failed to verify cluster access${NC}"
    exit 1
fi

# Setup common components
setup_metrics_server
setup_namespace

# Print cluster information
echo -e "\n${GREEN}Cluster setup completed!${NC}"
echo -e "${BLUE}Cluster Information:${NC}"
kubectl_with_sudo cluster-info
echo -e "\n${BLUE}Node Status:${NC}"
kubectl_with_sudo get nodes
echo -e "\n${BLUE}System Pods:${NC}"
kubectl_with_sudo get pods -A

echo -e "\n${GREEN}Your local Kubernetes cluster is ready!${NC}"
echo "To deploy the application:"
echo "1. sudo ./deploy.sh -e development"
echo "2. sudo ./health-check.sh to verify deployment"

# Add entries to /etc/hosts if needed
if [ "$CLUSTER_TYPE" = "kind" ] || [ "$CLUSTER_TYPE" = "minikube" ]; then
    echo -e "\n${YELLOW}Add the following to your /etc/hosts file:${NC}"
    echo "127.0.0.1    api.mankahi.local monitoring.mankahi.local"
    echo -e "\nCommand: sudo sh -c 'echo \"127.0.0.1    api.mankahi.local monitoring.mankahi.local\" >> /etc/hosts'"
fi
