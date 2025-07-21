// main.bicep - Azure E-Commerce Platform Infrastructure
// Reference the example patterns from /examples/bicep-templates/aks-cluster.bicep
targetScope = 'subscription'

@description('Environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Azure region for deployment')
param location string = 'eastus'

@description('Resource tags')
param tags object = {
  Environment: environment
  Project: 'E-Commerce Platform'
  ManagedBy: 'Bicep'
  CreatedBy: 'Azure-E-Commerce-PRP'
}

@description('Administrator username for VM and database')
param adminUsername string = 'azureuser'

@description('SSH public key for VM authentication')
@secure()
param sshPublicKey string = ''

@description('Database administrator password')
@secure()
param sqlAdminPassword string

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
  dependsOn: [
    resourceGroups
  ]
}

// Key Vault (must be deployed before AKS for secrets)
module keyVault 'modules/key-vault.bicep' = {
  name: 'keyvault-deployment'
  scope: resourceGroup(resourceGroups.outputs.sharedRgName)
  params: {
    environment: environment
    location: location
    tags: tags
    adminUsername: adminUsername
    sshPublicKey: sshPublicKey
    sqlAdminPassword: sqlAdminPassword
  }
  dependsOn: [
    resourceGroups
  ]
}

// Data Services
module dataServices 'modules/data-services.bicep' = {
  name: 'data-deployment'
  scope: resourceGroup(resourceGroups.outputs.dataRgName)
  params: {
    environment: environment
    location: location
    tags: tags
    sqlAdminPassword: sqlAdminPassword
    subnetId: networking.outputs.dataSubnetId
  }
  dependsOn: [
    resourceGroups
    networking
    keyVault
  ]
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
    adminUsername: adminUsername
    sshPublicKey: sshPublicKey
  }
  dependsOn: [
    resourceGroups
    networking
    keyVault
  ]
}

// Container Registry
module containerRegistry 'modules/container-registry.bicep' = {
  name: 'acr-deployment'
  scope: resourceGroup(resourceGroups.outputs.sharedRgName)
  params: {
    environment: environment
    location: location
    tags: tags
    aksClusterPrincipalId: aksCluster.outputs.clusterIdentityPrincipalId
  }
  dependsOn: [
    resourceGroups
    aksCluster
  ]
}

// Application Gateway
module applicationGateway 'modules/application-gateway.bicep' = {
  name: 'appgw-deployment'
  scope: resourceGroup(resourceGroups.outputs.networkingRgName)
  params: {
    environment: environment
    location: location
    tags: tags
    subnetId: networking.outputs.appGatewaySubnetId
  }
  dependsOn: [
    resourceGroups
    networking
  ]
}

// Monitoring
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring-deployment'
  scope: resourceGroup(resourceGroups.outputs.sharedRgName)
  params: {
    environment: environment
    location: location
    tags: tags
  }
  dependsOn: [
    resourceGroups
  ]
}

// Outputs
output resourceGroupNames object = resourceGroups.outputs
output networkingOutputs object = networking.outputs
output aksOutputs object = aksCluster.outputs
output dataServicesOutputs object = dataServices.outputs
output keyVaultOutputs object = keyVault.outputs
output containerRegistryOutputs object = containerRegistry.outputs
output applicationGatewayOutputs object = applicationGateway.outputs
output monitoringOutputs object = monitoring.outputs