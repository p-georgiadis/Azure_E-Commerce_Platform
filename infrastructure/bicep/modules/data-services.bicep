// modules/data-services.bicep
// Data services for the e-commerce platform: Cosmos DB, SQL Database, Service Bus, Event Hub
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

@description('SQL Database administrator password')
@secure()
param sqlAdminPassword string

@description('Data subnet resource ID for private endpoints')
param subnetId string

// Environment-specific configurations
var environmentConfig = {
  dev: {
    cosmosDbThroughput: 400
    sqlDbServiceTier: 'Basic'
    sqlDbSize: 'Basic'
    serviceBusSku: 'Standard'
    eventHubSku: 'Standard'
    eventHubCapacity: 1
    eventHubPartitions: 2
  }
  staging: {
    cosmosDbThroughput: 800
    sqlDbServiceTier: 'Standard'
    sqlDbSize: 'S2'
    serviceBusSku: 'Standard'
    eventHubSku: 'Standard'
    eventHubCapacity: 2
    eventHubPartitions: 4
  }
  prod: {
    cosmosDbThroughput: 1000
    sqlDbServiceTier: 'Premium'
    sqlDbSize: 'P2'
    serviceBusSku: 'Premium'
    eventHubSku: 'Standard'
    eventHubCapacity: 2
    eventHubPartitions: 8
  }
}

var config = environmentConfig[environment]

// Cosmos DB Account for Product Service
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: 'cosmos-ecommerce-${environment}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
      maxIntervalInSeconds: 300
      maxStalenessPrefix: 100000
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: environment == 'prod' ? true : false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: environment == 'prod' ? 240 : 1440
        backupRetentionIntervalInHours: environment == 'prod' ? 720 : 240
        backupStorageRedundancy: environment == 'prod' ? 'Geo' : 'Local'
      }
    }
    networkAclBypass: 'AzureServices'
    networkAclBypassResourceIds: []
    isVirtualNetworkFilterEnabled: true
    virtualNetworkRules: [
      {
        id: subnetId
        ignoreMissingVNetServiceEndpoint: false
      }
    ]
    ipRules: []
    enableFreeTier: environment == 'dev' ? true : false
    enableAnalyticalStorage: false
    enableAutomaticFailover: environment == 'prod' ? true : false
    enableMultipleWriteLocations: false
  }
}

// Cosmos DB Database
resource cosmosDbDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosDbAccount
  name: 'products'
  properties: {
    resource: {
      id: 'products'
    }
  }
}

// Cosmos DB Container for Products
resource cosmosDbContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDbDatabase
  name: 'products'
  properties: {
    resource: {
      id: 'products'
      partitionKey: {
        paths: ['/category']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/description/*'
          }
        ]
      }
    }
  }
}

// SQL Server for Order Service
resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: 'sql-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    administratorLogin: 'ecommerceadmin'
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: false
      login: 'Azure SQL Admin'
      principalType: 'Group'
      tenantId: subscription().tenantId
    }
    restrictOutboundNetworkAccess: 'Disabled'
  }
}

// SQL Database
resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: 'orders'
  location: location
  tags: tags
  sku: {
    name: config.sqlDbSize
    tier: config.sqlDbServiceTier
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: environment == 'prod' ? 268435456000 : 2147483648 // 250GB for prod, 2GB for others
    catalogCollation: 'SQL_Latin1_General_CP1_CI_AS'
    zoneRedundant: environment == 'prod' ? true : false
    readScale: environment == 'prod' ? 'Enabled' : 'Disabled'
    requestedBackupStorageRedundancy: environment == 'prod' ? 'Geo' : 'Local'
    maintenanceConfigurationId: '/subscriptions/${subscription().subscriptionId}/providers/Microsoft.Maintenance/publicMaintenanceConfigurations/SQL_Default'
    isLedgerOn: false
  }
}

// SQL Database Private Endpoint
resource sqlPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-sql-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'sql-connection'
        properties: {
          privateLinkServiceId: sqlServer.id
          groupIds: ['sqlServer']
        }
      }
    ]
  }
}

// Service Bus Namespace for Payment Service
resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2023-01-01-preview' = {
  name: 'sb-ecommerce-${environment}'
  location: location
  tags: tags
  sku: {
    name: config.serviceBusSku
    tier: config.serviceBusSku
    capacity: config.serviceBusSku == 'Premium' ? 1 : null
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: false
    zoneRedundant: environment == 'prod' ? true : false
  }
}

// Service Bus Queue for Payment Processing
resource paymentQueue 'Microsoft.ServiceBus/namespaces/queues@2023-01-01-preview' = {
  parent: serviceBusNamespace
  name: 'payment-processing'
  properties: {
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    enableBatchedOperations: true
    enableExpress: false
    enablePartitioning: config.serviceBusSku == 'Standard' ? true : false
    lockDuration: 'PT30S'
    maxDeliveryCount: 5
    maxMessageSizeInKilobytes: 256
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    requiresSession: false
  }
}

// Service Bus Topic for Order Events
resource orderEventsTopic 'Microsoft.ServiceBus/namespaces/topics@2023-01-01-preview' = {
  parent: serviceBusNamespace
  name: 'order-events'
  properties: {
    defaultMessageTimeToLive: 'P14D'
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    enableBatchedOperations: true
    enableExpress: false
    enablePartitioning: config.serviceBusSku == 'Standard' ? true : false
    maxMessageSizeInKilobytes: 256
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    supportOrdering: false
  }
}

// Service Bus Subscription for Notification Service
resource notificationSubscription 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2023-01-01-preview' = {
  parent: orderEventsTopic
  name: 'notification-service'
  properties: {
    deadLetteringOnFilterEvaluationExceptions: true
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    enableBatchedOperations: true
    lockDuration: 'PT30S'
    maxDeliveryCount: 5
    requiresSession: false
  }
}

// Service Bus Private Endpoint
resource serviceBusPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-sb-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'servicebus-connection'
        properties: {
          privateLinkServiceId: serviceBusNamespace.id
          groupIds: ['namespace']
        }
      }
    ]
  }
}

// Event Hub Namespace for Notification Service
resource eventHubNamespace 'Microsoft.EventHub/namespaces@2023-01-01-preview' = {
  name: 'evh-ecommerce-${environment}'
  location: location
  tags: tags
  sku: {
    name: config.eventHubSku
    tier: config.eventHubSku
    capacity: config.eventHubCapacity
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: false
    zoneRedundant: environment == 'prod' ? true : false
    kafkaEnabled: true
  }
}

// Event Hub for System Events
resource systemEventsHub 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'system-events'
  properties: {
    messageRetentionInDays: environment == 'prod' ? 7 : 1
    partitionCount: config.eventHubPartitions
    captureDescription: environment == 'prod' ? {
      enabled: true
      encoding: 'Avro'
      intervalInSeconds: 300
      sizeLimitInBytes: 314572800
      destination: {
        name: 'EventHubArchive.AzureBlockBlob'
        properties: {
          storageAccountResourceId: null // Would reference a storage account if created
          blobContainer: 'eventhub-capture'
          archiveNameFormat: '{Namespace}/{EventHub}/{PartitionId}/{Year}/{Month}/{Day}/{Hour}/{Minute}/{Second}'
        }
      }
    } : null
  }
}

// Event Hub for Application Telemetry
resource telemetryEventsHub 'Microsoft.EventHub/namespaces/eventhubs@2023-01-01-preview' = {
  parent: eventHubNamespace
  name: 'telemetry-events'
  properties: {
    messageRetentionInDays: 1
    partitionCount: config.eventHubPartitions
  }
}

// Event Hub Consumer Groups
resource systemEventsConsumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2023-01-01-preview' = {
  parent: systemEventsHub
  name: 'notification-service'
}

resource telemetryEventsConsumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2023-01-01-preview' = {
  parent: telemetryEventsHub
  name: 'analytics-service'
}

// Event Hub Private Endpoint
resource eventHubPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = {
  name: 'pe-evh-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'eventhub-connection'
        properties: {
          privateLinkServiceId: eventHubNamespace.id
          groupIds: ['namespace']
        }
      }
    ]
  }
}

// Outputs
output cosmosDb object = {
  accountName: cosmosDbAccount.name
  accountId: cosmosDbAccount.id
  databaseName: cosmosDbDatabase.name
  containerName: cosmosDbContainer.name
  endpoint: cosmosDbAccount.properties.documentEndpoint
  primaryKey: cosmosDbAccount.listKeys().primaryMasterKey
}

output sqlDatabase object = {
  serverName: sqlServer.name
  serverId: sqlServer.id
  databaseName: sqlDatabase.name
  databaseId: sqlDatabase.id
  fullyQualifiedDomainName: sqlServer.properties.fullyQualifiedDomainName
}

output serviceBus object = {
  namespaceName: serviceBusNamespace.name
  namespaceId: serviceBusNamespace.id
  primaryConnectionString: serviceBusNamespace.listKeys().primaryConnectionString
  queueName: paymentQueue.name
  topicName: orderEventsTopic.name
  subscriptionName: notificationSubscription.name
}

output eventHub object = {
  namespaceName: eventHubNamespace.name
  namespaceId: eventHubNamespace.id
  systemEventsHubName: systemEventsHub.name
  telemetryEventsHubName: telemetryEventsHub.name
  primaryConnectionString: eventHubNamespace.listKeys().primaryConnectionString
}