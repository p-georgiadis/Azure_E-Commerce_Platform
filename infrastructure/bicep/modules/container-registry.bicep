// modules/container-registry.bicep
// Azure Container Registry for storing Docker images
// Following PRP requirement #2: Use managed identity, NOT admin credentials
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

@description('AKS cluster managed identity principal ID for ACR pull access')
param aksClusterPrincipalId string

// Environment-specific configurations
var environmentConfig = {
  dev: {
    sku: 'Basic'
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
  staging: {
    sku: 'Standard'
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
  prod: {
    sku: 'Premium'
    adminUserEnabled: false
    publicNetworkAccess: 'Disabled'
    zoneRedundancy: 'Enabled'
  }
}

var config = environmentConfig[environment]

// Container Registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acrecommerce${environment}'
  location: location
  tags: tags
  sku: {
    name: config.sku
  }
  properties: {
    adminUserEnabled: config.adminUserEnabled
    publicNetworkAccess: config.publicNetworkAccess
    zoneRedundancy: config.zoneRedundancy
    anonymousPullEnabled: false
    networkRuleBypassOptions: 'AzureServices'
    policies: {
      quarantinePolicy: {
        status: environment == 'prod' ? 'enabled' : 'disabled'
      }
      trustPolicy: {
        type: 'Notary'
        status: environment == 'prod' ? 'enabled' : 'disabled'
      }
      retentionPolicy: {
        days: environment == 'prod' ? 30 : 7
        status: 'enabled'
      }
      exportPolicy: {
        status: 'enabled'
      }
      azureADAuthenticationAsArmPolicy: {
        status: 'enabled'
      }
      softDeletePolicy: {
        retentionDays: environment == 'prod' ? 30 : 7
        status: 'enabled'
      }
    }
    encryption: {
      status: 'disabled' // Can be enabled with customer-managed keys if needed
    }
    dataEndpointEnabled: true
    networkRuleSet: config.publicNetworkAccess == 'Disabled' ? {
      defaultAction: 'Deny'
      ipRules: []
      virtualNetworkRules: []
    } : null
  }
}

// Grant AKS cluster pull access to ACR using managed identity (best practice)
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, aksClusterPrincipalId, 'AcrPull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull
    principalId: aksClusterPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Repository for each service
resource repositories 'Microsoft.ContainerRegistry/registries/repositories@2023-07-01' = [for serviceName in ['frontend', 'product-service', 'order-service', 'payment-service', 'notification-service']: {
  parent: containerRegistry
  name: serviceName
}]

// Scope Maps for granular access control (Premium only)
resource serviceScopeMap 'Microsoft.ContainerRegistry/registries/scopeMaps@2023-07-01' = if (config.sku == 'Premium') {
  parent: containerRegistry
  name: 'service-scope-map'
  properties: {
    actions: [
      'repositories/frontend/content/read'
      'repositories/frontend/content/write'
      'repositories/product-service/content/read'
      'repositories/product-service/content/write'
      'repositories/order-service/content/read'
      'repositories/order-service/content/write'
      'repositories/payment-service/content/read'
      'repositories/payment-service/content/write'
      'repositories/notification-service/content/read'
      'repositories/notification-service/content/write'
    ]
    description: 'Scope map for e-commerce services'
  }
}

// Webhooks for CI/CD integration
resource buildWebhook 'Microsoft.ContainerRegistry/registries/webhooks@2023-07-01' = {
  parent: containerRegistry
  name: 'buildWebhook'
  location: location
  properties: {
    serviceUri: 'https://placeholder.azurewebsites.net/api/webhook'
    customHeaders: {
      'Authorization': 'Bearer placeholder-token'
    }
    status: 'enabled'
    scope: '*'
    actions: [
      'push'
      'delete'
    ]
  }
}

// Replication for geo-redundancy (Premium only)
resource replication 'Microsoft.ContainerRegistry/registries/replications@2023-07-01' = if (config.sku == 'Premium' && environment == 'prod') {
  parent: containerRegistry
  name: 'westus2'
  location: 'westus2'
  properties: {
    zoneRedundancy: 'Enabled'
  }
}

// Cache rule for frequently accessed images (Premium only)
resource cacheRule 'Microsoft.ContainerRegistry/registries/cacheRules@2023-07-01' = if (config.sku == 'Premium') {
  parent: containerRegistry
  name: 'dockerhub-cache'
  properties: {
    sourceRepository: 'docker.io/library/*'
    targetRepository: 'cache/library/*'
    credentialSetResourceId: null
  }
}

// Export pipeline for backup (Premium only)
resource exportPipeline 'Microsoft.ContainerRegistry/registries/exportPipelines@2023-07-01' = if (config.sku == 'Premium' && environment == 'prod') {
  parent: containerRegistry
  name: 'backup-pipeline'
  location: location
  properties: {
    target: {
      type: 'AzureStorageBlob'
      uri: 'https://placeholder.blob.core.windows.net/acr-backup'
      keyVaultUri: 'https://placeholder.vault.azure.net/secrets/storage-key'
    }
    options: [
      'OverwriteBlobs'
    ]
  }
  identity: {
    type: 'SystemAssigned'
  }
}

// Outputs
output acrName string = containerRegistry.name
output acrId string = containerRegistry.id
output acrLoginServer string = containerRegistry.properties.loginServer
output acrResourceId string = containerRegistry.id

output acr object = {
  name: containerRegistry.name
  id: containerRegistry.id
  loginServer: containerRegistry.properties.loginServer
  resourceId: containerRegistry.id
}

// Service-specific image references for use in Kubernetes manifests
output imageReferences object = {
  frontend: '${containerRegistry.properties.loginServer}/frontend:latest'
  productService: '${containerRegistry.properties.loginServer}/product-service:latest'
  orderService: '${containerRegistry.properties.loginServer}/order-service:latest'
  paymentService: '${containerRegistry.properties.loginServer}/payment-service:latest'
  notificationService: '${containerRegistry.properties.loginServer}/notification-service:latest'
}