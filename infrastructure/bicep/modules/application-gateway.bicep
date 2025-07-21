// modules/application-gateway.bicep
// Application Gateway as ingress controller for the e-commerce platform
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

@description('Application Gateway subnet resource ID')
param subnetId string

// Environment-specific configurations
var environmentConfig = {
  dev: {
    skuName: 'Standard_v2'
    tier: 'Standard_v2'
    capacity: 1
    minCapacity: 1
    maxCapacity: 2
    cookieBasedAffinity: 'Disabled'
    requestTimeout: 30
  }
  staging: {
    skuName: 'Standard_v2'
    tier: 'Standard_v2'
    capacity: 2
    minCapacity: 2
    maxCapacity: 5
    cookieBasedAffinity: 'Disabled'
    requestTimeout: 30
  }
  prod: {
    skuName: 'WAF_v2'
    tier: 'WAF_v2'
    capacity: 2
    minCapacity: 2
    maxCapacity: 10
    cookieBasedAffinity: 'Disabled'
    requestTimeout: 30
  }
}

var config = environmentConfig[environment]

// Public IP for Application Gateway
resource publicIP 'Microsoft.Network/publicIPAddresses@2023-05-01' = {
  name: 'pip-appgw-ecommerce-${environment}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
    dnsSettings: {
      domainNameLabel: 'ecommerce-${environment}-${uniqueString(resourceGroup().id)}'
    }
    idleTimeoutInMinutes: 4
  }
  zones: environment == 'prod' ? ['1', '2', '3'] : null
}

// User Assigned Managed Identity for Application Gateway
resource appGwIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-appgw-ecommerce-${environment}'
  location: location
  tags: tags
}

// Application Gateway
resource applicationGateway 'Microsoft.Network/applicationGateways@2023-05-01' = {
  name: 'appgw-ecommerce-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appGwIdentity.id}': {}
    }
  }
  properties: {
    sku: {
      name: config.skuName
      tier: config.tier
    }
    autoscaleConfiguration: {
      minCapacity: config.minCapacity
      maxCapacity: config.maxCapacity
    }
    gatewayIPConfigurations: [
      {
        name: 'appGwIpConfig'
        properties: {
          subnet: {
            id: subnetId
          }
        }
      }
    ]
    frontendIPConfigurations: [
      {
        name: 'appGwPublicFrontendIp'
        properties: {
          publicIPAddress: {
            id: publicIP.id
          }
        }
      }
    ]
    frontendPorts: [
      {
        name: 'http-port'
        properties: {
          port: 80
        }
      }
      {
        name: 'https-port'
        properties: {
          port: 443
        }
      }
    ]
    backendAddressPools: [
      {
        name: 'frontend-backend'
        properties: {
          backendAddresses: [
            {
              fqdn: 'frontend-service.ecommerce-${environment}.svc.cluster.local'
            }
          ]
        }
      }
      {
        name: 'product-service-backend'
        properties: {
          backendAddresses: [
            {
              fqdn: 'product-service.ecommerce-${environment}.svc.cluster.local'
            }
          ]
        }
      }
      {
        name: 'order-service-backend'
        properties: {
          backendAddresses: [
            {
              fqdn: 'order-service.ecommerce-${environment}.svc.cluster.local'
            }
          ]
        }
      }
    ]
    backendHttpSettingsCollection: [
      {
        name: 'frontend-http-settings'
        properties: {
          port: 80
          protocol: 'Http'
          cookieBasedAffinity: config.cookieBasedAffinity
          requestTimeout: config.requestTimeout
          probe: {
            id: resourceId('Microsoft.Network/applicationGateways/probes', 'appgw-ecommerce-${environment}', 'frontend-health-probe')
          }
          connectionDraining: {
            enabled: true
            drainTimeoutInSec: 60
          }
        }
      }
      {
        name: 'api-http-settings'
        properties: {
          port: 8000
          protocol: 'Http'
          cookieBasedAffinity: config.cookieBasedAffinity
          requestTimeout: config.requestTimeout
          probe: {
            id: resourceId('Microsoft.Network/applicationGateways/probes', 'appgw-ecommerce-${environment}', 'api-health-probe')
          }
          connectionDraining: {
            enabled: true
            drainTimeoutInSec: 60
          }
          pickHostNameFromBackendAddress: false
          hostName: 'api.ecommerce-${environment}.com'
        }
      }
    ]
    httpListeners: [
      {
        name: 'frontend-listener'
        properties: {
          frontendIPConfiguration: {
            id: resourceId('Microsoft.Network/applicationGateways/frontendIPConfigurations', 'appgw-ecommerce-${environment}', 'appGwPublicFrontendIp')
          }
          frontendPort: {
            id: resourceId('Microsoft.Network/applicationGateways/frontendPorts', 'appgw-ecommerce-${environment}', 'http-port')
          }
          protocol: 'Http'
          requireServerNameIndication: false
        }
      }
      {
        name: 'api-listener'
        properties: {
          frontendIPConfiguration: {
            id: resourceId('Microsoft.Network/applicationGateways/frontendIPConfigurations', 'appgw-ecommerce-${environment}', 'appGwPublicFrontendIp')
          }
          frontendPort: {
            id: resourceId('Microsoft.Network/applicationGateways/frontendPorts', 'appgw-ecommerce-${environment}', 'http-port')
          }
          protocol: 'Http'
          requireServerNameIndication: false
          hostNames: [
            'api.ecommerce-${environment}.com'
          ]
        }
      }
    ]
    requestRoutingRules: [
      {
        name: 'frontend-routing-rule'
        properties: {
          ruleType: 'Basic'
          priority: 100
          httpListener: {
            id: resourceId('Microsoft.Network/applicationGateways/httpListeners', 'appgw-ecommerce-${environment}', 'frontend-listener')
          }
          backendAddressPool: {
            id: resourceId('Microsoft.Network/applicationGateways/backendAddressPools', 'appgw-ecommerce-${environment}', 'frontend-backend')
          }
          backendHttpSettings: {
            id: resourceId('Microsoft.Network/applicationGateways/backendHttpSettingsCollection', 'appgw-ecommerce-${environment}', 'frontend-http-settings')
          }
        }
      }
      {
        name: 'api-routing-rule'
        properties: {
          ruleType: 'PathBasedRouting'
          priority: 200
          httpListener: {
            id: resourceId('Microsoft.Network/applicationGateways/httpListeners', 'appgw-ecommerce-${environment}', 'api-listener')
          }
          urlPathMap: {
            id: resourceId('Microsoft.Network/applicationGateways/urlPathMaps', 'appgw-ecommerce-${environment}', 'api-path-map')
          }
        }
      }
    ]
    urlPathMaps: [
      {
        name: 'api-path-map'
        properties: {
          defaultBackendAddressPool: {
            id: resourceId('Microsoft.Network/applicationGateways/backendAddressPools', 'appgw-ecommerce-${environment}', 'product-service-backend')
          }
          defaultBackendHttpSettings: {
            id: resourceId('Microsoft.Network/applicationGateways/backendHttpSettingsCollection', 'appgw-ecommerce-${environment}', 'api-http-settings')
          }
          pathRules: [
            {
              name: 'products-path-rule'
              properties: {
                paths: ['/api/products/*']
                backendAddressPool: {
                  id: resourceId('Microsoft.Network/applicationGateways/backendAddressPools', 'appgw-ecommerce-${environment}', 'product-service-backend')
                }
                backendHttpSettings: {
                  id: resourceId('Microsoft.Network/applicationGateways/backendHttpSettingsCollection', 'appgw-ecommerce-${environment}', 'api-http-settings')
                }
              }
            }
            {
              name: 'orders-path-rule'
              properties: {
                paths: ['/api/orders/*']
                backendAddressPool: {
                  id: resourceId('Microsoft.Network/applicationGateways/backendAddressPools', 'appgw-ecommerce-${environment}', 'order-service-backend')
                }
                backendHttpSettings: {
                  id: resourceId('Microsoft.Network/applicationGateways/backendHttpSettingsCollection', 'appgw-ecommerce-${environment}', 'api-http-settings')
                }
              }
            }
          ]
        }
      }
    ]
    probes: [
      {
        name: 'frontend-health-probe'
        properties: {
          protocol: 'Http'
          host: '127.0.0.1'
          path: '/health'
          interval: 30
          timeout: 30
          unhealthyThreshold: 3
          pickHostNameFromBackendHttpSettings: false
          minServers: 0
          match: {
            statusCodes: ['200-399']
          }
        }
      }
      {
        name: 'api-health-probe'
        properties: {
          protocol: 'Http'
          host: '127.0.0.1'
          path: '/health'
          interval: 30
          timeout: 30
          unhealthyThreshold: 3
          pickHostNameFromBackendHttpSettings: false
          minServers: 0
          match: {
            statusCodes: ['200-399']
          }
        }
      }
    ]
    webApplicationFirewallConfiguration: config.tier == 'WAF_v2' ? {
      enabled: true
      firewallMode: 'Prevention'
      ruleSetType: 'OWASP'
      ruleSetVersion: '3.2'
      requestBodyCheck: true
      maxRequestBodySizeInKb: 128
      fileUploadLimitInMb: 100
    } : null
    enableHttp2: true
    forceFirewallPolicyAssociation: false
  }
  zones: environment == 'prod' ? ['1', '2', '3'] : null
}

// WAF Policy (for WAF_v2 tier)
resource wafPolicy 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies@2023-05-01' = if (config.tier == 'WAF_v2') {
  name: 'wafpol-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    policySettings: {
      requestBodyCheck: true
      maxRequestBodySizeInKb: 128
      fileUploadLimitInMb: 100
      state: 'Enabled'
      mode: 'Prevention'
      requestBodyEnforcement: true
      requestBodyInspectLimitInKB: 128
      fileUploadEnforcement: true
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'OWASP'
          ruleSetVersion: '3.2'
          ruleGroupOverrides: []
        }
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '0.1'
        }
      ]
    }
    customRules: [
      {
        name: 'RateLimitRule'
        priority: 100
        ruleType: 'RateLimitRule'
        rateLimitDuration: 'OneMin'
        rateLimitThreshold: 100
        matchConditions: [
          {
            matchVariables: [
              {
                variableName: 'RemoteAddr'
              }
            ]
            operator: 'IPMatch'
            matchValues: ['0.0.0.0/0']
            negationConditon: false
          }
        ]
        action: 'Block'
      }
    ]
  }
}

// Associate WAF Policy with Application Gateway
resource wafPolicyAssociation 'Microsoft.Network/applicationGateways@2023-05-01' = if (config.tier == 'WAF_v2') {
  name: 'appgw-ecommerce-${environment}-waf-association'
  location: location
  tags: tags
  properties: union(applicationGateway.properties, {
    firewallPolicy: {
      id: wafPolicy.id
    }
  })
  dependsOn: [
    applicationGateway
    wafPolicy
  ]
}

// Outputs
output applicationGatewayName string = applicationGateway.name
output applicationGatewayId string = applicationGateway.id
output publicIPAddress string = publicIP.properties.ipAddress
output publicIPFqdn string = publicIP.properties.dnsSettings.fqdn

output applicationGateway object = {
  name: applicationGateway.name
  id: applicationGateway.id
  publicIPAddress: publicIP.properties.ipAddress
  publicIPFqdn: publicIP.properties.dnsSettings.fqdn
}