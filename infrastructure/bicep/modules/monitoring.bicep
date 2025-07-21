// modules/monitoring.bicep
// Monitoring and observability infrastructure - Application Insights, Log Analytics
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

// Environment-specific configurations
var environmentConfig = {
  dev: {
    retentionInDays: 30
    dailyQuotaGb: 1
    workspaceSkuName: 'PerGB2018'
    applicationInsightsType: 'web'
    samplingPercentage: 100
  }
  staging: {
    retentionInDays: 90
    dailyQuotaGb: 5
    workspaceSkuName: 'PerGB2018'
    applicationInsightsType: 'web'
    samplingPercentage: 50
  }
  prod: {
    retentionInDays: 365
    dailyQuotaGb: 20
    workspaceSkuName: 'PerGB2018'
    applicationInsightsType: 'web'
    samplingPercentage: 10
  }
}

var config = environmentConfig[environment]

// Log Analytics Workspace
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: config.workspaceSkuName
    }
    retentionInDays: config.retentionInDays
    features: {
      legacy: 0
      searchVersion: 1
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: config.dailyQuotaGb
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// Application Insights for application monitoring
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-ecommerce-${environment}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: config.applicationInsightsType
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    RetentionInDays: config.retentionInDays
    SamplingPercentage: config.samplingPercentage
    DisableIpMasking: false
    ImmediatePurgeDataOn30Days: environment != 'prod'
  }
}

// Data Collection Rule for Container Insights
resource containerInsightsDataCollectionRule 'Microsoft.Insights/dataCollectionRules@2022-06-01' = {
  name: 'dcr-container-insights-${environment}'
  location: location
  tags: tags
  kind: 'Linux'
  properties: {
    description: 'Data Collection Rule for Container Insights'
    dataSources: {
      extensions: [
        {
          streams: ['Microsoft-ContainerInsights-Group-Default']
          extensionName: 'ContainerInsights'
          extensionSettings: {
            dataCollectionSettings: {
              interval: '1m'
              namespaceFilteringMode: 'Off'
              namespaces: ['kube-system', 'gatekeeper-system', 'azure-arc']
              enableContainerLogV2: true
            }
          }
          name: 'ContainerInsightsExtension'
        }
      ]
    }
    destinations: {
      logAnalytics: [
        {
          workspaceResourceId: logAnalyticsWorkspace.id
          name: 'ciworkspace'
        }
      ]
    }
    dataFlows: [
      {
        streams: ['Microsoft-ContainerInsights-Group-Default']
        destinations: ['ciworkspace']
      }
    ]
  }
}

// Diagnostic Settings for Activity Log
resource activityLogDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'activity-log-${environment}'
  scope: subscription()
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        category: 'Administrative'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'Security'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'ServiceHealth'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'Alert'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'Recommendation'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'Policy'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'Autoscale'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
      {
        category: 'ResourceHealth'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}

// Action Group for Alerts
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-ecommerce-${environment}'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'EComAlerts'
    enabled: true
    emailReceivers: [
      {
        name: 'DevOps Team'
        emailAddress: 'devops@ecommerce-platform.com'
        useCommonAlertSchema: true
      }
      {
        name: 'Platform Team'
        emailAddress: 'platform@ecommerce-platform.com'
        useCommonAlertSchema: true
      }
    ]
    smsReceivers: environment == 'prod' ? [
      {
        name: 'On-Call Engineer'
        countryCode: '1'
        phoneNumber: '5551234567'
      }
    ] : []
    webhookReceivers: [
      {
        name: 'Teams Webhook'
        serviceUri: 'https://placeholder.webhook.office.com/webhookb2/placeholder'
        useCommonAlertSchema: true
      }
    ]
    logicAppReceivers: []
    azureFunctionReceivers: []
  }
}

// Alert Rules
resource highCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'High CPU Usage - ${environment}'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when CPU usage is high'
    severity: 2
    enabled: true
    scopes: [
      logAnalyticsWorkspace.id
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          threshold: 80
          name: 'HighCpu'
          metricNamespace: 'Insights.Container/pods'
          metricName: 'cpuUsageMillicores'
          operator: 'GreaterThan'
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

resource highMemoryAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'High Memory Usage - ${environment}'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when memory usage is high'
    severity: 2
    enabled: true
    scopes: [
      logAnalyticsWorkspace.id
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          threshold: 80
          name: 'HighMemory'
          metricNamespace: 'Insights.Container/pods'
          metricName: 'memoryWorkingSetBytes'
          operator: 'GreaterThan'
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

resource applicationErrorsAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'High Error Rate - ${environment}'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when application error rate is high'
    severity: 1
    enabled: true
    scopes: [
      applicationInsights.id
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          threshold: 10
          name: 'HighErrorRate'
          metricNamespace: 'microsoft.insights/components'
          metricName: 'exceptions/count'
          operator: 'GreaterThan'
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    autoMitigate: true
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// Workbook for monitoring dashboard
resource monitoringWorkbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: guid('ecommerce-monitoring-${environment}')
  location: location
  tags: tags
  kind: 'shared'
  properties: {
    displayName: 'E-Commerce Platform Monitoring - ${environment}'
    serializedData: '''
    {
      "version": "Notebook/1.0",
      "items": [
        {
          "type": 1,
          "content": {
            "json": "# E-Commerce Platform Monitoring Dashboard\\n\\nThis dashboard provides an overview of the e-commerce platform health and performance."
          }
        },
        {
          "type": 3,
          "content": {
            "version": "KqlItem/1.0",
            "query": "ContainerInventory | where TimeGenerated > ago(1h) | summarize count() by Computer",
            "size": 1,
            "title": "Container Count by Node"
          }
        }
      ]
    }
    '''
    category: 'workbook'
    sourceId: logAnalyticsWorkspace.id
  }
}

// Outputs
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output logAnalyticsWorkspaceName string = logAnalyticsWorkspace.name
output applicationInsightsId string = applicationInsights.id
output applicationInsightsName string = applicationInsights.name
output applicationInsightsConnectionString string = applicationInsights.properties.ConnectionString
output applicationInsightsInstrumentationKey string = applicationInsights.properties.InstrumentationKey

output monitoring object = {
  logAnalyticsWorkspace: {
    id: logAnalyticsWorkspace.id
    name: logAnalyticsWorkspace.name
    customerId: logAnalyticsWorkspace.properties.customerId
  }
  applicationInsights: {
    id: applicationInsights.id
    name: applicationInsights.name
    connectionString: applicationInsights.properties.ConnectionString
    instrumentationKey: applicationInsights.properties.InstrumentationKey
  }
  actionGroup: {
    id: actionGroup.id
    name: actionGroup.name
  }
  dataCollectionRule: {
    id: containerInsightsDataCollectionRule.id
    name: containerInsightsDataCollectionRule.name
  }
}