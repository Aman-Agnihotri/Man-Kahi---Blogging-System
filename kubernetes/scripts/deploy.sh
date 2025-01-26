#!/bin/bash

# Set default values
ENVIRONMENT="development"
NAMESPACE="mankahi"
ACTION="apply"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -e|--environment)
      ENVIRONMENT="$2"
      shift
      shift
      ;;
    -n|--namespace)
      NAMESPACE="$2"
      shift
      shift
      ;;
    -a|--action)
      ACTION="$2"
      shift
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|production)$ ]]; then
    echo "Invalid environment. Must be 'development' or 'production'"
    exit 1
fi

# Validate action
if [[ ! "$ACTION" =~ ^(apply|delete)$ ]]; then
    echo "Invalid action. Must be 'apply' or 'delete'"
    exit 1
fi

echo "Deploying ManKahi to $ENVIRONMENT environment..."

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "kubectl is not installed"
    exit 1
fi

# Check if kustomize is installed
if ! command -v kustomize &> /dev/null; then
    echo "kustomize is not installed"
    exit 1
fi

# Create namespace if it doesn't exist
if [[ "$ACTION" == "apply" ]]; then
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
fi

# Apply/Delete Kubernetes configurations
echo "Performing $ACTION for $ENVIRONMENT environment..."
kustomize build ../overlays/$ENVIRONMENT | kubectl $ACTION -f -

if [[ "$ACTION" == "apply" ]]; then
    # Wait for deployments to be ready
    echo "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment --all -n $NAMESPACE

    # Get service endpoints
    echo "Service endpoints:"
    kubectl get ingress -n $NAMESPACE
    
    if [[ "$ENVIRONMENT" == "development" ]]; then
        echo "
Development environment is ready!
Add the following to your /etc/hosts file:
127.0.0.1    api.mankahi.local monitoring.mankahi.local
        "
    else
        echo "Production environment is ready!"
    fi
else
    echo "Resources in $ENVIRONMENT environment have been deleted"
fi
