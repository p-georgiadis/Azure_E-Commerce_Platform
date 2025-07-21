// modules/networking.bicep
// Creates networking infrastructure for the e-commerce platform
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

// VNet configuration based on environment
var vnetConfig = {
  dev: {
    addressPrefix: '10.0.0.0/16'
    subnets: {
      aks: '10.0.0.0/20'          // 10.0.0.0 - 10.0.15.255 (4096 addresses)
      appGateway: '10.0.16.0/24'  // 10.0.16.0 - 10.0.16.255 (256 addresses)
      data: '10.0.17.0/24'        // 10.0.17.0 - 10.0.17.255 (256 addresses)
      management: '10.0.18.0/24'  // 10.0.18.0 - 10.0.18.255 (256 addresses)
    }
  }
  staging: {
    addressPrefix: '10.1.0.0/16'
    subnets: {
      aks: '10.1.0.0/20'
      appGateway: '10.1.16.0/24'
      data: '10.1.17.0/24'
      management: '10.1.18.0/24'
    }
  }
  prod: {
    addressPrefix: '10.2.0.0/16'
    subnets: {
      aks: '10.2.0.0/20'
      appGateway: '10.2.16.0/24'
      data: '10.2.17.0/24'
      management: '10.2.18.0/24'
    }
  }
}

// Network Security Groups
resource aksNetworkSecurityGroup 'Microsoft.Network/networkSecurityGroups@2023-05-01' = {
  name: 'nsg-aks-${environment}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowHTTPS'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1000
          direction: 'Inbound'
        }
      }
      {
        name: 'AllowHTTP'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1100
          direction: 'Inbound'
        }
      }
      {
        name: 'AllowKubernetesAPI'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '6443'
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1200
          direction: 'Inbound'
        }
      }
    ]
  }
}

resource appGatewayNetworkSecurityGroup 'Microsoft.Network/networkSecurityGroups@2023-05-01' = {
  name: 'nsg-appgw-${environment}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowHTTPS'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1000
          direction: 'Inbound'
        }
      }
      {
        name: 'AllowHTTP'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1100
          direction: 'Inbound'
        }
      }
      {
        name: 'AllowApplicationGatewayV2'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '65200-65535'
          sourceAddressPrefix: 'GatewayManager'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1200
          direction: 'Inbound'
        }
      }
      {
        name: 'AllowAzureLoadBalancer'
        properties: {
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: 'AzureLoadBalancer'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1300
          direction: 'Inbound'
        }
      }
    ]
  }
}

resource dataNetworkSecurityGroup 'Microsoft.Network/networkSecurityGroups@2023-05-01' = {
  name: 'nsg-data-${environment}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowAKSSubnet'
        properties: {
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: vnetConfig[environment].subnets.aks
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1000
          direction: 'Inbound'
        }
      }
      {
        name: 'DenyAll'
        properties: {
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Deny'
          priority: 4000
          direction: 'Inbound'
        }
      }
    ]
  }
}

resource managementNetworkSecurityGroup 'Microsoft.Network/networkSecurityGroups@2023-05-01' = {
  name: 'nsg-mgmt-${environment}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowManagementTraffic'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: 'VirtualNetwork'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 1000
          direction: 'Inbound'
        }
      }
    ]
  }
}

// Virtual Network
resource virtualNetwork 'Microsoft.Network/virtualNetworks@2023-05-01' = {
  name: 'vnet-ecommerce-${environment}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetConfig[environment].addressPrefix
      ]
    }
    enableDdosProtection: environment == 'prod' ? true : false
    subnets: [
      {
        name: 'snet-aks-${environment}'
        properties: {
          addressPrefix: vnetConfig[environment].subnets.aks
          networkSecurityGroup: {
            id: aksNetworkSecurityGroup.id
          }
          serviceEndpoints: [
            {
              service: 'Microsoft.ContainerRegistry'
            }
            {
              service: 'Microsoft.KeyVault'
            }
            {
              service: 'Microsoft.Storage'
            }
          ]
        }
      }
      {
        name: 'snet-appgw-${environment}'
        properties: {
          addressPrefix: vnetConfig[environment].subnets.appGateway
          networkSecurityGroup: {
            id: appGatewayNetworkSecurityGroup.id
          }
        }
      }
      {
        name: 'snet-data-${environment}'
        properties: {
          addressPrefix: vnetConfig[environment].subnets.data
          networkSecurityGroup: {
            id: dataNetworkSecurityGroup.id
          }
          serviceEndpoints: [
            {
              service: 'Microsoft.Sql'
            }
            {
              service: 'Microsoft.DocumentDB'
            }
            {
              service: 'Microsoft.ServiceBus'
            }
            {
              service: 'Microsoft.EventHub'
            }
            {
              service: 'Microsoft.KeyVault'
            }
          ]
        }
      }
      {
        name: 'snet-mgmt-${environment}'
        properties: {
          addressPrefix: vnetConfig[environment].subnets.management
          networkSecurityGroup: {
            id: managementNetworkSecurityGroup.id
          }
          serviceEndpoints: [
            {
              service: 'Microsoft.KeyVault'
            }
            {
              service: 'Microsoft.Storage'
            }
          ]
        }
      }
    ]
  }
}

// Route Table for AKS subnet
resource aksRouteTable 'Microsoft.Network/routeTables@2023-05-01' = {
  name: 'rt-aks-${environment}'
  location: location
  tags: tags
  properties: {
    routes: [
      {
        name: 'default-route'
        properties: {
          addressPrefix: '0.0.0.0/0'
          nextHopType: 'Internet'
        }
      }
    ]
    disableBgpRoutePropagation: false
  }
}

// Outputs
output vnetId string = virtualNetwork.id
output vnetName string = virtualNetwork.name
output aksSubnetId string = virtualNetwork.properties.subnets[0].id
output appGatewaySubnetId string = virtualNetwork.properties.subnets[1].id
output dataSubnetId string = virtualNetwork.properties.subnets[2].id
output managementSubnetId string = virtualNetwork.properties.subnets[3].id

output subnets object = {
  aks: {
    id: virtualNetwork.properties.subnets[0].id
    name: virtualNetwork.properties.subnets[0].name
    addressPrefix: virtualNetwork.properties.subnets[0].properties.addressPrefix
  }
  appGateway: {
    id: virtualNetwork.properties.subnets[1].id
    name: virtualNetwork.properties.subnets[1].name
    addressPrefix: virtualNetwork.properties.subnets[1].properties.addressPrefix
  }
  data: {
    id: virtualNetwork.properties.subnets[2].id
    name: virtualNetwork.properties.subnets[2].name
    addressPrefix: virtualNetwork.properties.subnets[2].properties.addressPrefix
  }
  management: {
    id: virtualNetwork.properties.subnets[3].id
    name: virtualNetwork.properties.subnets[3].name
    addressPrefix: virtualNetwork.properties.subnets[3].properties.addressPrefix
  }
}

output networkSecurityGroups object = {
  aks: aksNetworkSecurityGroup.id
  appGateway: appGatewayNetworkSecurityGroup.id
  data: dataNetworkSecurityGroup.id
  management: managementNetworkSecurityGroup.id
}