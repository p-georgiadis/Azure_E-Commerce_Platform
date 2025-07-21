#!/bin/bash
# Azure E-Commerce Platform Deployment Script
# This script automates the deployment of the entire platform

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
ENVIRONMENT="dev"
SKIP_INFRASTRUCTURE="false"
SKIP_APPLICATIONS="false"
VERBOSE="false"
DRY_RUN="false"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Help function
show_help() {
    cat << EOF
Azure E-Commerce Platform Deployment Script

Usage: $0 [OPTIONS]

Options:
    -e, --environment ENV       Target environment (dev, staging, prod) [default: dev]
    -s, --skip-infrastructure   Skip infrastructure deployment
    -a, --skip-applications     Skip application deployment
    -v, --verbose              Enable verbose output
    -d, --dry-run              Show what would be deployed without actually deploying
    -h, --help                 Show this help message

Examples:
    $0                          # Deploy to dev environment
    $0 -e staging              # Deploy to staging environment
    $0 -e prod -s              # Deploy apps to prod (skip infrastructure)
    $0 -d                      # Dry run for dev environment

Environment Variables:
    AZURE_SUBSCRIPTION_ID      Azure subscription ID
    AZURE_TENANT_ID           Azure tenant ID
    AZURE_CLIENT_ID           Service principal client ID
    AZURE_CLIENT_SECRET       Service principal client secret
    ACR_NAME                  Azure Container Registry name
    AKS_CLUSTER_NAME         AKS cluster name
    AKS_RESOURCE_GROUP       AKS resource group name
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -s|--skip-infrastructure)
            SKIP_INFRASTRUCTURE="true"
            shift
            ;;
        -a|--skip-applications)
            SKIP_APPLICATIONS="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE="true"
            shift
            ;;
        -d|--dry-run)
            DRY_RUN="true"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
case "$ENVIRONMENT" in
    dev|staging|prod)
        log_info "Target environment: $ENVIRONMENT"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT. Must be dev, staging, or prod."
        exit 1
        ;;
esac

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    local tools=("az" "kubectl" "docker" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool '$tool' is not installed"
            exit 1
        fi
    done
    
    # Check Azure CLI login
    if ! az account show &> /dev/null; then
        log_error "Not logged in to Azure CLI. Please run 'az login'"
        exit 1
    fi
    
    # Check environment variables
    local required_vars=()
    
    if [[ "$SKIP_INFRASTRUCTURE" == "false" ]]; then
        required_vars+=("AZURE_SUBSCRIPTION_ID" "AZURE_TENANT_ID")
    fi
    
    if [[ "$SKIP_APPLICATIONS" == "false" ]]; then
        required_vars+=("ACR_NAME" "AKS_CLUSTER_NAME" "AKS_RESOURCE_GROUP")
    fi
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable '$var' is not set"
            exit 1
        fi
    done
    
    log_success "Prerequisites check completed"
}

# Deploy infrastructure using Bicep
deploy_infrastructure() {
    if [[ "$SKIP_INFRASTRUCTURE" == "true" ]]; then
        log_info "Skipping infrastructure deployment"
        return
    fi
    
    log_info "Deploying infrastructure for $ENVIRONMENT environment..."
    
    local deployment_name="ecommerce-$ENVIRONMENT-$(date +%Y%m%d%H%M%S)"
    local location="East US"
    local bicep_dir="$ROOT_DIR/infrastructure/bicep"
    local params_file="$bicep_dir/parameters/$ENVIRONMENT.parameters.json"
    
    if [[ ! -f "$params_file" ]]; then
        log_error "Parameter file not found: $params_file"
        exit 1
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would deploy infrastructure with:"
        log_info "  Template: $bicep_dir/main.bicep"
        log_info "  Parameters: $params_file"
        log_info "  Deployment: $deployment_name"
        log_info "  Location: $location"
        return
    fi
    
    # Validate template first
    log_info "Validating Bicep template..."
    az deployment sub validate \
        --location "$location" \
        --template-file "$bicep_dir/main.bicep" \
        --parameters "@$params_file" \
        --parameters deploymentName="$deployment_name"
    
    # Deploy infrastructure
    log_info "Starting infrastructure deployment..."
    local deployment_output
    deployment_output=$(az deployment sub create \
        --name "$deployment_name" \
        --location "$location" \
        --template-file "$bicep_dir/main.bicep" \
        --parameters "@$params_file" \
        --parameters deploymentName="$deployment_name" \
        --query 'properties.outputs' \
        --output json)
    
    if [[ $? -eq 0 ]]; then
        log_success "Infrastructure deployment completed"
        
        # Save deployment outputs
        echo "$deployment_output" > "$ROOT_DIR/deployment-outputs-$ENVIRONMENT.json"
        log_info "Deployment outputs saved to deployment-outputs-$ENVIRONMENT.json"
        
        # Display key outputs
        log_info "Key infrastructure components:"
        echo "$deployment_output" | jq -r 'to_entries[] | "  \(.key): \(.value.value)"'
    else
        log_error "Infrastructure deployment failed"
        exit 1
    fi
}

# Build and push container images
build_and_push_images() {
    if [[ "$SKIP_APPLICATIONS" == "true" ]]; then
        log_info "Skipping application deployment"
        return
    fi
    
    log_info "Building and pushing container images..."
    
    local services=("product-service" "order-service" "payment-service" "notification-service" "frontend")
    local image_tag="$ENVIRONMENT-$(date +%Y%m%d%H%M%S)"
    
    # Login to ACR
    log_info "Logging in to Azure Container Registry..."
    az acr login --name "$ACR_NAME"
    
    for service in "${services[@]}"; do
        log_info "Building $service..."
        
        local service_dir="$ROOT_DIR/services/$service"
        if [[ ! -d "$service_dir" ]]; then
            log_warning "Service directory not found: $service_dir. Skipping."
            continue
        fi
        
        local image_name="$ACR_NAME.azurecr.io/$service"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would build and push: $image_name:$image_tag"
            continue
        fi
        
        # Build image
        docker build -t "$image_name:$image_tag" -t "$image_name:latest" "$service_dir"
        
        # Push image
        docker push "$image_name:$image_tag"
        docker push "$image_name:latest"
        
        log_success "Built and pushed $service"
    done
}

# Deploy applications to Kubernetes
deploy_applications() {
    if [[ "$SKIP_APPLICATIONS" == "true" ]]; then
        return
    fi
    
    log_info "Deploying applications to Kubernetes..."
    
    # Get AKS credentials
    log_info "Getting AKS credentials..."
    az aks get-credentials --resource-group "$AKS_RESOURCE_GROUP" --name "$AKS_CLUSTER_NAME" --overwrite-existing
    
    # Verify cluster connection
    kubectl cluster-info
    
    local k8s_dir="$ROOT_DIR/infrastructure/k8s/overlays/$ENVIRONMENT"
    
    if [[ ! -d "$k8s_dir" ]]; then
        log_error "Kubernetes overlay directory not found: $k8s_dir"
        exit 1
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would deploy applications from: $k8s_dir"
        return
    fi
    
    # Create namespace if it doesn't exist
    kubectl create namespace ecommerce-platform --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy using kustomize
    log_info "Applying Kubernetes manifests..."
    kubectl apply -k "$k8s_dir"
    
    # Wait for deployments to be ready
    log_info "Waiting for deployments to be ready..."
    local deployments=("product-service" "order-service" "payment-service" "notification-service" "frontend-service" "api-gateway")
    
    for deployment in "${deployments[@]}"; do
        log_info "Waiting for $deployment to be ready..."
        kubectl rollout status deployment/"$deployment" -n ecommerce-platform --timeout=300s
    done
    
    log_success "Application deployment completed"
}

# Verify deployment
verify_deployment() {
    if [[ "$SKIP_APPLICATIONS" == "true" ]]; then
        return
    fi
    
    log_info "Verifying deployment..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would verify deployment"
        return
    fi
    
    # Check pod status
    log_info "Pod status:"
    kubectl get pods -n ecommerce-platform
    
    # Check service status
    log_info "Service status:"
    kubectl get services -n ecommerce-platform
    
    # Check ingress status
    log_info "Ingress status:"
    kubectl get ingress -n ecommerce-platform
    
    # Run health checks
    log_info "Running health checks..."
    local services=("product-service" "order-service" "payment-service" "notification-service")
    
    for service in "${services[@]}"; do
        local health_url="http://$(kubectl get service "$service" -n ecommerce-platform -o jsonpath='{.spec.clusterIP}'):$(kubectl get service "$service" -n ecommerce-platform -o jsonpath='{.spec.ports[0].port}')/health"
        
        if kubectl run health-check-"$service" --rm -i --restart=Never --image=curlimages/curl -- curl -f "$health_url"; then
            log_success "$service health check passed"
        else
            log_warning "$service health check failed"
        fi
    done
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    # Remove any temporary files created during deployment
}

# Main execution
main() {
    log_info "Starting Azure E-Commerce Platform deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Skip Infrastructure: $SKIP_INFRASTRUCTURE"
    log_info "Skip Applications: $SKIP_APPLICATIONS"
    log_info "Dry Run: $DRY_RUN"
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Execute deployment steps
    check_prerequisites
    deploy_infrastructure
    build_and_push_images
    deploy_applications
    verify_deployment
    
    log_success "Deployment completed successfully!"
    
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        log_warning "Production deployment completed. Please verify all services are working correctly."
    fi
}

# Run main function
main "$@"