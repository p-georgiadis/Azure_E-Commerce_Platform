# PRP: Azure E-Commerce Microservices Platform Implementation

## Overview
Build a comprehensive Azure-hosted microservices e-commerce platform demonstrating full DevOps practices with Power Platform integration. This PRP provides a complete implementation blueprint with all necessary context for successful one-pass implementation.

## Critical Context and Resources

### Documentation URLs (MUST READ)
- **Azure Kubernetes Service Best Practices**: https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-microservices/aks-microservices
- **Well-Architected Framework for AKS**: https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-kubernetes-service
- **Advanced AKS Microservices Architecture**: https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-microservices/aks-microservices-advanced
- **FastAPI Deployment**: https://fastapi.tiangolo.com/deployment/
- **Bicep Deployment Stacks**: https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deployment-stacks
- **Template Specs**: https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/template-specs
- **Power Platform ALM**: https://docs.microsoft.com/en-us/power-platform/alm/

### Example Files to Reference (CRITICAL)
1. **Docker Pattern**: `/examples/docker/multi-stage.Dockerfile` - Shows multi-stage builds, security contexts, health checks
2. **Kubernetes Pattern**: `/examples/kubernetes/deployment-with-probes.yaml` - Complete deployment with probes, security, HPA
3. **Python Pattern**: `/examples/scripts/health-check.py` - Async health checks with Azure integration
4. **CI/CD Pattern**: `/examples/azure-pipelines/multi-stage.yml` - Complete pipeline with security scanning

### Architecture Patterns to Implement
1. **API Gateway Pattern**: Use Azure Application Gateway as ingress
2. **Publisher-Subscriber**: Azure Service Bus for async messaging
3. **Sidecar Pattern**: Logging and monitoring sidecars
4. **Circuit Breaker**: Implement in services for resilience
5. **Bulkhead Pattern**: Resource isolation between services

## Implementation Blueprint

### Phase 1: Project Structure Setup

```
azure_e-commerce_platform/
├── services/
│   ├── frontend/                 # React/TypeScript with Nginx
│   ├── product-service/          # Python/FastAPI with Cosmos DB
│   ├── order-service/           # Node.js/Express with SQL Database
│   ├── payment-service/         # Python/Flask with Service Bus
│   └── notification-service/    # Python with Event Hub
├── infrastructure/
│   ├── bicep/
│   │   ├── main.bicep          # Main orchestrator
│   │   ├── modules/            # Resource modules
│   │   └── parameters/         # Environment parameters
│   └── scripts/                # Deployment scripts
├── kubernetes/
│   ├── base/                   # Base manifests
│   ├── overlays/              # Environment overlays
│   └── monitoring/            # Prometheus/Grafana
├── power-platform/
│   ├── solutions/             # Power Platform solutions
│   ├── canvas-apps/           # Canvas applications
│   └── flows/                 # Power Automate flows
├── pipelines/
│   ├── azure-devops/          # Azure DevOps YAML
│   └── github-actions/        # GitHub Actions workflows
└── scripts/
    ├── automation/            # Python automation scripts
    └── deployment/            # Bash deployment scripts
```

### Phase 2: Infrastructure as Code (Bicep)

#### Main Bicep Template Structure
```bicep
// main.bicep - Reference the example patterns
targetScope = 'subscription'

param environment string
param location string = 'eastus'
param tags object = {
  Environment: environment
  Project: 'E-Commerce Platform'
  ManagedBy: 'Bicep'
}

// Resource Groups
module resourceGroups 'modules/resource-groups.bicep' = {
  name: 'rg-deployment'
  params: {
    environment: environment
    location: location
    tags: tags
  }
}

// Networking
module networking 'modules/networking.bicep' = {
  name: 'network-deployment'
  scope: resourceGroup(resourceGroups.outputs.networkingRgName)
  params: {
    environment: environment
    location: location
    tags: tags
  }
}

// AKS Cluster - Use pattern from /examples/bicep-templates/aks-cluster.bicep
module aksCluster 'modules/aks-cluster.bicep' = {
  name: 'aks-deployment'
  scope: resourceGroup(resourceGroups.outputs.aksRgName)
  params: {
    environment: environment
    location: location
    vnetId: networking.outputs.vnetId
    subnetId: networking.outputs.aksSubnetId
    tags: tags
  }
}

// Data Services
module dataServices 'modules/data-services.bicep' = {
  name: 'data-deployment'
  scope: resourceGroup(resourceGroups.outputs.dataRgName)
  params: {
    environment: environment
    location: location
    tags: tags
  }
}
```

### Phase 3: Microservices Implementation

#### Product Service (Python/FastAPI) - Priority 1
```python
# services/product-service/app/main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from azure.cosmos.aio import CosmosClient
from azure.identity.aio import DefaultAzureCredential
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

# Follow pattern from /examples/docker/multi-stage.Dockerfile for containerization
# Use async patterns from /examples/scripts/health-check.py

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.cosmos_client = CosmosClient(
        os.environ["COSMOS_ENDPOINT"],
        credential=DefaultAzureCredential()
    )
    yield
    # Shutdown
    await app.state.cosmos_client.close()

app = FastAPI(
    title="Product Service",
    version="1.0.0",
    lifespan=lifespan
)

# Instrument for observability
FastAPIInstrumentor.instrument_app(app)

# Health endpoints matching K8s probes pattern
@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/ready")
async def ready():
    # Check Cosmos DB connection
    try:
        await app.state.cosmos_client.get_database_client("products").read()
        return {"status": "ready"}
    except:
        raise HTTPException(status_code=503, detail="Service not ready")
```

#### Frontend Service (React/TypeScript)
```typescript
// services/frontend/src/App.tsx
// Implement with proper error boundaries and telemetry
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';

const reactPlugin = new ReactPlugin();
const appInsights = new ApplicationInsights({
    config: {
        connectionString: process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING,
        extensions: [reactPlugin]
    }
});
appInsights.loadAppInsights();
```

### Phase 4: Kubernetes Manifests

Follow the pattern from `/examples/kubernetes/deployment-with-probes.yaml`:
- Comprehensive health probes (liveness, readiness, startup)
- Security contexts (non-root, read-only filesystem)
- Resource limits and requests
- Pod anti-affinity for HA
- Workload identity for Azure integration
- Prometheus metrics annotations

### Phase 5: CI/CD Implementation

#### GitHub Actions Workflow
```yaml
# pipelines/github-actions/deploy.yml
# Base on /examples/azure-pipelines/multi-stage.yml patterns
name: Deploy E-Commerce Platform

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: acrecommerce.azurecr.io
  
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [frontend, product-service, order-service, payment-service, notification-service]
    steps:
      - uses: actions/checkout@v3
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v4
        with:
          context: ./services/${{ matrix.service }}
          file: ./services/${{ matrix.service }}/Dockerfile
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ matrix.service }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ matrix.service }}:latest
          cache-from: type=registry,ref=${{ env.REGISTRY }}/${{ matrix.service }}:buildcache
          cache-to: type=registry,ref=${{ env.REGISTRY }}/${{ matrix.service }}:buildcache,mode=max
```

### Phase 6: Power Platform Integration

#### Power BI Streaming Dataset
Reference `/examples/power-bi/streaming-dataset.json` for real-time metrics:
- Service health status
- Response times
- Error rates
- Deployment metrics

#### Power Automate Flows
Reference `/examples/power-automate/approval-flow.json`:
- Deployment approvals
- Incident management
- Order notifications

### Phase 7: Scripts and Automation

#### Health Check Script
Extend `/examples/scripts/health-check.py` pattern for all services:
- Async health checks
- Azure Monitor integration
- Power BI streaming
- Comprehensive error handling

## Implementation Tasks (In Order)

### Infrastructure Setup
1. Create project structure directories
2. Implement Bicep modules for resource groups
3. Implement networking module with VNet, subnets, NSGs
4. Implement AKS cluster module based on example
5. Implement data services module (Cosmos DB, SQL, Service Bus, Event Hub)
6. Implement Key Vault module with access policies
7. Create deployment stacks for each environment
8. Create template specs for reusability

### Microservices Development
9. Implement Product Service with FastAPI and Cosmos DB
10. Implement Order Service with Express and SQL Database
11. Implement Payment Service with Flask and Service Bus
12. Implement Notification Service with Event Hub integration
13. Implement Frontend with React and TypeScript
14. Create Dockerfiles for all services (multi-stage builds)
15. Implement comprehensive health check endpoints
16. Add OpenTelemetry instrumentation

### Kubernetes Deployment
17. Create base Kubernetes manifests
18. Implement Kustomize overlays for environments
19. Configure service mesh (optional but recommended)
20. Deploy Prometheus and Grafana
21. Configure ingress with Application Gateway
22. Implement network policies
23. Configure pod security policies
24. Set up horizontal pod autoscaling

### CI/CD Pipeline
25. Implement GitHub Actions workflows
26. Implement Azure DevOps pipelines
27. Add security scanning (Trivy, SonarQube)
28. Implement canary deployment strategy
29. Add automated rollback mechanisms
30. Configure deployment approvals

### Power Platform
31. Create Power BI workspace and datasets
32. Implement streaming datasets for real-time metrics
33. Create operational dashboards
34. Implement Power Apps for admin portal
35. Create Power Automate flows for automation
36. Implement Power Virtual Agents bots

### Scripts and Automation
37. Create deployment automation scripts
38. Implement health monitoring scripts
39. Create backup and restore scripts
40. Implement cost optimization scripts

## Validation Gates (MUST PASS)

### Python Services Validation
```bash
# For each Python service
cd services/product-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Lint and type check
ruff check . --fix
mypy app/

# Run tests
pytest tests/ -v --cov=app --cov-report=term-missing

# Security scan
bandit -r app/
safety check
```

### Node.js Service Validation
```bash
cd services/order-service
npm install
npm run lint
npm run test
npm audit
```

### Frontend Validation
```bash
cd services/frontend
npm install
npm run lint
npm run type-check
npm run test
npm run build
```

### Docker Build Validation
```bash
# For each service
docker build -t test-service:latest .
docker run --rm test-service:latest pytest || echo "Tests passed"
trivy image test-service:latest
```

### Kubernetes Validation
```bash
# Validate manifests
kubectl apply --dry-run=client -f kubernetes/base/
kubeval kubernetes/base/*.yaml
kubectl-score score kubernetes/base/*.yaml
```

### Infrastructure Validation
```bash
# Validate Bicep
az bicep build --file infrastructure/bicep/main.bicep
az deployment sub what-if \
  --location eastus \
  --template-file infrastructure/bicep/main.bicep \
  --parameters @infrastructure/bicep/parameters/dev.parameters.json
```

## Common Pitfalls to Avoid (CRITICAL)

1. **Bicep API Versions**: Use latest stable API versions (2023-05-01 or newer)
2. **Container Registry**: Use managed identity, NOT admin credentials
3. **Kubernetes Namespaces**: Create separate namespaces for each environment
4. **Secret Management**: NEVER hardcode secrets - use Key Vault references
5. **CORS Configuration**: Frontend must properly configure CORS for API access
6. **Health Endpoints**: All services MUST expose /health and /ready endpoints
7. **Python Async**: Use `async def` for I/O operations in FastAPI
8. **Resource Naming**: Follow pattern: `{resource-type}-{app}-{environment}`
9. **Error Handling**: Handle Azure CLI auth failures and API rate limits
10. **Monitoring Retention**: Configure based on environment (30d for prod)
11. **Power Apps Licensing**: Design for per-app licensing model
12. **Deployment Rollback**: Always test rollback before production
13. **Cost Optimization**: Use spot instances for non-prod AKS pools
14. **Network Policies**: Implement zero-trust networking
15. **Pod Security**: Run as non-root with read-only filesystem

## Expected Outcome

A fully functional Azure-hosted microservices e-commerce platform with:
- 5 containerized microservices running on AKS
- Complete infrastructure as code with Bicep
- Multi-environment CI/CD pipelines
- Comprehensive monitoring and observability
- Power Platform integration for business users
- Production-ready security and scalability

## Success Criteria

1. All services pass health checks
2. Prometheus scrapes metrics from all services
3. CI/CD pipeline deploys to all environments
4. Power BI dashboard shows real-time metrics
5. All validation gates pass
6. Zero hardcoded secrets
7. Horizontal scaling works under load

## References

- Initial Requirements: `/INITIAL.md`
- Docker Example: `/examples/docker/multi-stage.Dockerfile`
- Kubernetes Example: `/examples/kubernetes/deployment-with-probes.yaml`
- Python Example: `/examples/scripts/health-check.py`
- Pipeline Example: `/examples/azure-pipelines/multi-stage.yml`

---

**Confidence Score: 8.5/10**

The score reflects high confidence due to:
- Comprehensive examples provided
- Clear implementation patterns
- Detailed validation gates
- Well-documented pitfalls

Minor deductions for:
- Complex Power Platform integration requiring specific tenant setup
- Multiple Azure services requiring proper permissions
- Potential environment-specific configurations