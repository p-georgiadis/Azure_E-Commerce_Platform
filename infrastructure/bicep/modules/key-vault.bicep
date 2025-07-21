// modules/key-vault.bicep
// Key Vault for secure secret management following PRP requirement #4
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

@description('Administrator username for VM and database')
param adminUsername string

@description('SSH public key for VM authentication')
@secure()
param sshPublicKey string

@description('SQL Database administrator password')
@secure()
param sqlAdminPassword string

// Environment-specific configurations
var environmentConfig = {
  dev: {
    skuName: 'standard'
    enableRbacAuthorization: true
    enablePurgeProtection: false
    softDeleteRetentionInDays: 7
  }
  staging: {
    skuName: 'standard'
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 30
  }
  prod: {
    skuName: 'premium'
    enableRbacAuthorization: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
  }
}

var config = environmentConfig[environment]

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: config.skuName
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: config.enableRbacAuthorization
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    enablePurgeProtection: config.enablePurgeProtection
    enableSoftDelete: true
    softDeleteRetentionInDays: config.softDeleteRetentionInDays
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

// Secrets stored in Key Vault
resource sqlAdminPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'sql-admin-password'
  properties: {
    value: sqlAdminPassword
    contentType: 'password'
    attributes: {
      enabled: true
    }
  }
}

resource adminUsernameSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'admin-username'
  properties: {
    value: adminUsername
    contentType: 'username'
    attributes: {
      enabled: true
    }
  }
}

resource sshPublicKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ssh-public-key'
  properties: {
    value: sshPublicKey
    contentType: 'public-key'
    attributes: {
      enabled: true
    }
  }
}

// Application Insights connection string (placeholder for now)
resource appInsightsConnectionString 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'appinsights-connection-string'
  properties: {
    value: 'InstrumentationKey=placeholder;IngestionEndpoint=placeholder'
    contentType: 'connection-string'
    attributes: {
      enabled: true
    }
  }
}

// JWT secret for authentication
resource jwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'jwt-secret'
  properties: {
    value: base64(guid(keyVault.id, 'jwt-secret'))
    contentType: 'secret'
    attributes: {
      enabled: true
    }
  }
}

// Encryption key for sensitive data
resource encryptionKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'data-encryption-key'
  properties: {
    value: base64(guid(keyVault.id, 'encryption-key'))
    contentType: 'encryption-key'
    attributes: {
      enabled: true
    }
  }
}

// Service principal client secret (for service-to-service auth)
resource servicePrincipalSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'service-principal-secret'
  properties: {
    value: base64(guid(keyVault.id, 'service-principal'))
    contentType: 'client-secret'
    attributes: {
      enabled: true
    }
  }
}

// SMTP configuration for notifications
resource smtpPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'smtp-password'
  properties: {
    value: base64(guid(keyVault.id, 'smtp-password'))
    contentType: 'password'
    attributes: {
      enabled: true
    }
  }
}

resource smtpUsername 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'smtp-username'
  properties: {
    value: 'notifications@ecommerce-platform.com'
    contentType: 'username'
    attributes: {
      enabled: true
    }
  }
}

// Redis cache connection string (for session management)
resource redisCacheConnectionString 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'redis-connection-string'
  properties: {
    value: 'redis-placeholder:6380,password=placeholder,ssl=True,abortConnect=False'
    contentType: 'connection-string'
    attributes: {
      enabled: true
    }
  }
}

// API keys for external services
resource paymentGatewayApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'payment-gateway-api-key'
  properties: {
    value: base64(guid(keyVault.id, 'payment-api-key'))
    contentType: 'api-key'
    attributes: {
      enabled: true
    }
  }
}

resource powerBiStreamingUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'powerbi-streaming-url'
  properties: {
    value: 'https://api.powerbi.com/beta/placeholder/datasets/placeholder/rows'
    contentType: 'url'
    attributes: {
      enabled: true
    }
  }
}

// Key Vault Access Policy for AKS Cluster (using object ID)
// Note: In production, you'd get the AKS cluster's managed identity object ID
resource keyVaultAccessPolicyForAKS 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  name: 'add'
  parent: keyVault
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: '00000000-0000-0000-0000-000000000000' // Placeholder - should be AKS managed identity
        permissions: {
          secrets: ['get', 'list']
          keys: ['get', 'list']
          certificates: ['get', 'list']
        }
      }
    ]
  }
}

// Key Vault Private DNS Zone
resource keyVaultPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
  tags: tags
}

// Outputs
output keyVaultName string = keyVault.name
output keyVaultId string = keyVault.id
output keyVaultUri string = keyVault.properties.vaultUri

output secrets object = {
  sqlAdminPassword: sqlAdminPasswordSecret.name
  adminUsername: adminUsernameSecret.name
  sshPublicKey: sshPublicKeySecret.name
  appInsightsConnectionString: appInsightsConnectionString.name
  jwtSecret: jwtSecret.name
  dataEncryptionKey: encryptionKey.name
  servicePrincipalSecret: servicePrincipalSecret.name
  smtpPassword: smtpPassword.name
  smtpUsername: smtpUsername.name
  redisCacheConnectionString: redisCacheConnectionString.name
  paymentGatewayApiKey: paymentGatewayApiKey.name
  powerBiStreamingUrl: powerBiStreamingUrl.name
}

// Key Vault references for use in other modules
output keyVaultReferences object = {
  sqlAdminPassword: {
    reference: {
      keyVault: {
        id: keyVault.id
      }
      secretName: sqlAdminPasswordSecret.name
    }
  }
  appInsightsConnectionString: {
    reference: {
      keyVault: {
        id: keyVault.id
      }
      secretName: appInsightsConnectionString.name
    }
  }
  jwtSecret: {
    reference: {
      keyVault: {
        id: keyVault.id
      }
      secretName: jwtSecret.name
    }
  }
}