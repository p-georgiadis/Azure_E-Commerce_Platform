// modules/resource-groups.bicep
// Creates all resource groups for the e-commerce platform
targetScope = 'subscription'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

// Resource Groups
resource aksResourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-ecommerce-aks-${environment}'
  location: location
  tags: union(tags, {
    Purpose: 'AKS Cluster and related resources'
  })
}

resource networkingResourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-ecommerce-network-${environment}'
  location: location
  tags: union(tags, {
    Purpose: 'Networking resources - VNet, NSGs, Application Gateway'
  })
}

resource dataResourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-ecommerce-data-${environment}'
  location: location
  tags: union(tags, {
    Purpose: 'Data services - Cosmos DB, SQL Database, Service Bus, Event Hub'
  })
}

resource sharedResourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-ecommerce-shared-${environment}'
  location: location
  tags: union(tags, {
    Purpose: 'Shared services - Key Vault, Container Registry, Application Insights'
  })
}

// Outputs
output aksRgName string = aksResourceGroup.name
output networkingRgName string = networkingResourceGroup.name
output dataRgName string = dataResourceGroup.name
output sharedRgName string = sharedResourceGroup.name

output resourceGroups object = {
  aks: aksResourceGroup.name
  networking: networkingResourceGroup.name
  data: dataResourceGroup.name
  shared: sharedResourceGroup.name
}