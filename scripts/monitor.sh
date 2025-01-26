#!/bin/bash

# Set default values
NAMESPACE="mankahi"
SERVICE=""
TAIL_LINES=100
COMPONENT=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      NAMESPACE="$2"
      shift
      shift
      ;;
    -s|--service)
      SERVICE="$2"
      shift
      shift
      ;;
    -l|--lines)
      TAIL_LINES="$2"
      shift
      shift
      ;;
    -c|--component)
      COMPONENT="$2"
      shift
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Function to show usage
show_usage() {
    echo "Usage: ./monitor.sh [-n namespace] [-s service] [-l lines] [-c component]"
    echo ""
    echo "Components:"
    echo "  health     - Show health status of all services"
    echo "  pods       - Show pod status"
    echo "  services   - Show service status"
    echo "  ingress    - Show ingress status"
    echo "  logs       - Show logs (requires -s service)"
    echo "  metrics    - Show service metrics"
    echo "  resources  - Show resource usage"
    echo ""
    echo "Examples:"
    echo "  ./monitor.sh -c health"
    echo "  ./monitor.sh -c logs -s auth-service"
    echo "  ./monitor.sh -c metrics -s blog-service"
    exit 1
}

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "kubectl is not installed"
    exit 1
fi

# Function to check service health
check_health() {
    echo "Checking service health..."
    kubectl get deployments -n $NAMESPACE
    echo ""
    kubectl get pods -n $NAMESPACE
    echo ""
    echo "Resource usage:"
    kubectl top pods -n $NAMESPACE
}

# Function to show logs
show_logs() {
    if [ -z "$SERVICE" ]; then
        echo "Error: Service name is required for logs"
        exit 1
    fi
    echo "Showing logs for $SERVICE..."
    kubectl logs -n $NAMESPACE -l app=$SERVICE --tail=$TAIL_LINES -f
}

# Function to show metrics
show_metrics() {
    if [ -z "$SERVICE" ]; then
        echo "Showing metrics for all services..."
        kubectl get --raw "/apis/metrics.k8s.io/v1beta1/namespaces/$NAMESPACE/pods/" | jq .
    else
        echo "Showing metrics for $SERVICE..."
        kubectl get --raw "/apis/metrics.k8s.io/v1beta1/namespaces/$NAMESPACE/pods/" | \
        jq ".items[] | select(.metadata.labels.app==\"$SERVICE\")"
    fi
}

# Function to show resource usage
show_resources() {
    echo "CPU and Memory usage:"
    kubectl top pods -n $NAMESPACE
    echo ""
    echo "Persistent Volume Claims:"
    kubectl get pvc -n $NAMESPACE
    echo ""
    echo "Resource Quotas:"
    kubectl describe resourcequota -n $NAMESPACE
}

# Main logic based on component
case $COMPONENT in
    "health")
        check_health
        ;;
    "pods")
        kubectl get pods -n $NAMESPACE -o wide
        ;;
    "services")
        kubectl get services -n $NAMESPACE
        ;;
    "ingress")
        kubectl get ingress -n $NAMESPACE
        ;;
    "logs")
        show_logs
        ;;
    "metrics")
        show_metrics
        ;;
    "resources")
        show_resources
        ;;
    *)
        show_usage
        ;;
esac
