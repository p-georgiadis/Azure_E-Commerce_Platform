## FEATURE:
Build a comprehensive Azure-hosted microservices e-commerce platform demonstrating full DevOps practices with Power Platform integration. The platform should showcase:

### Core Microservices Architecture:
- **Frontend Service**: React/TypeScript customer-facing web application served via Nginx
- **Product Service**: Python/FastAPI service managing product catalog with Azure Cosmos DB
- **Order Service**: Node.js/Express service handling order processing with Azure SQL Database
- **Payment Service**: Python/Flask service simulating payment processing with Azure Service Bus
- **Notification Service**: Python service managing email/SMS notifications via Azure Event Hub

### Infrastructure Requirements:
- **Container Orchestration**: Azure Kubernetes Service (AKS) with auto-scaling capabilities
- **Container Registry**: Azure Container Registry (ACR) for Docker image storage
- **Infrastructure as Code**: Complete Bicep templates, Template Specs, and Deployment Stacks
- **Networking**: Azure Application Gateway as ingress controller with proper network policies
- **Security**: Azure Key Vault for secrets management with managed identities
- **Data Storage**: Azure Cosmos DB (NoSQL), Azure SQL Database (relational), Azure Storage Account
- **Messaging**: Azure Service Bus for async communication, Azure Event Hub for event streaming

### DevOps Implementation:
- **CI/CD Pipelines**: Both Azure DevOps and GitHub Actions implementations
- **Container Security**: Automated vulnerability scanning in pipelines
- **Multi-Environment Support**: Dev, staging, and production configurations
- **Monitoring**: Azure Monitor, Prometheus, and Grafana with custom dashboards
- **Automation Scripts**: Python and Bash scripts for deployment, health checks, and operations

### Power Platform Integration:
- **Power BI**: Real-time operations dashboard, DevOps metrics, sales analytics
- **Power Apps**: Admin portal (Canvas), mobile tracking app, DevOps approval app (Model-driven)
- **Power Automate**: Deployment approvals, incident management, order notifications, infrastructure alerts
- **Power Virtual Agents**: Customer support bot, IT helpdesk bot, order status bot
- **Dataverse**: Centralized data platform for Power Platform components

### Specific Technical Requirements:
- All services must be containerized with multi-stage Docker builds
- Kubernetes manifests with proper health checks and resource limits
- Prometheus metrics exposed from all services
- Python services must include FastAPI/Flask with async support
- Bash scripts must be idempotent and include error handling
- Power Platform solutions must support ALM with managed/unmanaged solutions

**EXAMPLES:**
The following example files should be created in the `examples/` folder:
- `bicep-templates/aks-cluster.bicep` - Sample AKS cluster configuration with monitoring enabled
- `docker/multi-stage.Dockerfile` - Example multi-stage build for Python services
- `kubernetes/deployment-with-probes.yaml` - K8s deployment with liveness/readiness probes
- `power-automate/approval-flow.json` - Sample approval workflow for deployments
- `power-bi/streaming-dataset.json` - Configuration for real-time Power BI dataset
- `scripts/health-check.py` - Python script demonstrating service health monitoring
- `azure-pipelines/multi-stage.yml` - Complete CI/CD pipeline with security scanning

**DOCUMENTATION:**
The following documentation should be referenced during development:
- Azure Kubernetes Service best practices: https://docs.microsoft.com/en-us/azure/aks/best-practices
- Bicep documentation: https://docs.microsoft.com/en-us/azure/azure-resource-manager/bicep/
- Azure DevOps YAML schema: https://docs.microsoft.com/en-us/azure/devops/pipelines/yaml-schema
- Power Platform ALM guide: https://docs.microsoft.com/en-us/power-platform/alm/
- Prometheus operator for Kubernetes: https://github.com/prometheus-operator/prometheus-operator
- FastAPI documentation: https://fastapi.tiangolo.com/
- Docker multi-stage builds: https://docs.docker.com/develop/develop-images/multistage-build/
- Azure Monitor container insights: https://docs.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview

**OTHER CONSIDERATIONS:**
### Common AI Assistant Pitfalls to Avoid:
1. **Bicep Syntax**: Ensure all Bicep templates use the latest API versions and proper module structure. Don't mix ARM JSON syntax with Bicep.
2. **Kubernetes Namespaces**: Each environment (dev, staging, prod) should have its own namespace with proper RBAC.
3. **Container Registry Authentication**: ACR integration with AKS should use managed identity, not admin credentials.
4. **Power Platform Service Principal**: Must be properly configured with correct API permissions for automation.
5. **Prometheus Configuration**: ServiceMonitor CRDs must be in the correct namespace and match service labels.
6. **Python Async**: FastAPI routes should use `async def` where appropriate, especially for I/O operations.
7. **Error Handling**: All scripts must handle Azure CLI authentication failures and API rate limits.
8. **Secret Management**: Never hardcode secrets; always use Key Vault references or Kubernetes secrets.
9. **Resource Naming**: Follow Azure naming conventions and include environment suffix (dev/staging/prod).
10. **Monitoring Data Retention**: Configure appropriate retention policies for logs and metrics based on environment.
11. **Power Apps Licensing**: Consider per-app vs per-user licensing implications in the design.
12. **Cross-Origin Resource Sharing (CORS)**: Frontend service must properly configure CORS for API access.
13. **Health Check Endpoints**: All services must expose `/health` and `/ready` endpoints for K8s probes.
14. **Deployment Rollback**: Include rollback strategies in both Azure DevOps and GitHub Actions.
15. **Cost Optimization**: Use spot instances for non-production AKS node pools where appropriate.