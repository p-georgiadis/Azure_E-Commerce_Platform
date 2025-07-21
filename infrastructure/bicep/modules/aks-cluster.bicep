// modules/aks-cluster.bicep
// AKS cluster configuration based on /examples/bicep-templates/aks-cluster.bicep
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string

@description('Azure region for deployment')
param location string

@description('Resource tags')
param tags object

@description('Virtual Network resource ID')
param vnetId string

@description('AKS subnet resource ID')
param subnetId string

@description('Administrator username for AKS nodes')
param adminUsername string = 'azureuser'

@description('SSH public key for AKS node authentication')
@secure()
param sshPublicKey string

// Environment-specific configurations
var environmentConfig = {
  dev: {
    kubernetesVersion: '1.28.3'
    systemNodeCount: 1
    systemNodeMin: 1
    systemNodeMax: 3
    workloadNodeCount: 2
    workloadNodeMin: 1
    workloadNodeMax: 5
    spotNodeMin: 0
    spotNodeMax: 3
    systemVmSize: 'Standard_D2s_v3'
    workloadVmSize: 'Standard_D2s_v3'
    spotVmSize: 'Standard_D2s_v3'
  }
  staging: {
    kubernetesVersion: '1.28.3'
    systemNodeCount: 2
    systemNodeMin: 2
    systemNodeMax: 5
    workloadNodeCount: 3
    workloadNodeMin: 2
    workloadNodeMax: 8
    spotNodeMin: 0
    spotNodeMax: 5
    systemVmSize: 'Standard_D4s_v3'
    workloadVmSize: 'Standard_D4s_v3'
    spotVmSize: 'Standard_D4s_v3'
  }
  prod: {
    kubernetesVersion: '1.28.3'
    systemNodeCount: 3
    systemNodeMin: 3
    systemNodeMax: 10
    workloadNodeCount: 5
    workloadNodeMin: 3
    workloadNodeMax: 20
    spotNodeMin: 0
    spotNodeMax: 10
    systemVmSize: 'Standard_D4s_v3'
    workloadVmSize: 'Standard_D8s_v3'
    spotVmSize: 'Standard_D4s_v3'
  }
}

var config = environmentConfig[environment]

// Network configuration for different environments
var networkConfig = {
  dev: {
    serviceCidr: '10.0.100.0/24'
    dnsServiceIP: '10.0.100.10'
    dockerBridgeCidr: '172.17.0.1/16'
  }
  staging: {
    serviceCidr: '10.1.100.0/24'
    dnsServiceIP: '10.1.100.10'
    dockerBridgeCidr: '172.18.0.1/16'
  }
  prod: {
    serviceCidr: '10.2.100.0/24'
    dnsServiceIP: '10.2.100.10'
    dockerBridgeCidr: '172.19.0.1/16'
  }
}

// User Assigned Managed Identity for AKS
resource aksIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-aks-${environment}'
  location: location
  tags: tags
}

// AKS Cluster
resource aksCluster 'Microsoft.ContainerService/managedClusters@2024-01-01' = {
  name: 'aks-ecommerce-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${aksIdentity.id}': {}
    }
  }
  properties: {
    dnsPrefix: 'aks-ecommerce-${environment}'
    kubernetesVersion: config.kubernetesVersion
    enableRBAC: true
    
    // Network configuration
    networkProfile: {
      networkPlugin: 'azure'
      networkPluginMode: 'overlay'
      networkPolicy: 'calico'
      networkDataplane: 'azure'
      loadBalancerSku: 'standard'
      serviceCidr: networkConfig[environment].serviceCidr
      dnsServiceIP: networkConfig[environment].dnsServiceIP
      dockerBridgeCidr: networkConfig[environment].dockerBridgeCidr
      outboundType: 'loadBalancer'
      podCidr: '10.244.0.0/16'
    }
    
    // System node pool
    agentPoolProfiles: [
      {
        name: 'system'
        count: config.systemNodeCount
        vmSize: config.systemVmSize
        mode: 'System'
        osType: 'Linux'
        osSKU: 'Ubuntu'
        maxPods: 30
        type: 'VirtualMachineScaleSets'
        vnetSubnetID: subnetId
        enableAutoScaling: true
        minCount: config.systemNodeMin
        maxCount: config.systemNodeMax
        availabilityZones: environment == 'prod' ? ['1', '2', '3'] : ['1']
        upgradeSettings: {
          maxSurge: '33%'
        }
        nodeLabels: {
          'node-role.kubernetes.io/system': 'true'
          'environment': environment
        }
        nodeTaints: [
          'CriticalAddonsOnly=true:NoSchedule'
        ]
      }
    ]
    
    // Linux profile for SSH access
    linuxProfile: {
      adminUsername: adminUsername
      ssh: {
        publicKeys: [
          {
            keyData: sshPublicKey
          }
        ]
      }
    }
    
    // Add-ons configuration
    addonProfiles: {
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: {
          enableSecretRotation: 'true'
          rotationPollInterval: '2m'
        }
      }
      azurepolicy: {
        enabled: true
      }
      openServiceMesh: {
        enabled: false // Will be enabled later if needed
      }
    }
    
    // Security configuration
    apiServerAccessProfile: {
      enablePrivateCluster: false // Can be enabled for production if needed
      authorizedIPRanges: environment == 'prod' ? [] : []
      enablePrivateClusterPublicFQDN: false
    }
    
    // Auto-upgrade configuration
    autoUpgradeProfile: {
      upgradeChannel: environment == 'prod' ? 'patch' : 'rapid'
    }
    
    // Maintenance window
    maintenanceWindow: {
      schedule: {
        weekly: {
          intervalWeeks: 1
          dayOfWeek: 'Sunday'
          startTime: '02:00'
          duration: 4
        }
      }
    }
    
    // Workload Identity
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
      imageCleaner: {
        enabled: true
        intervalHours: 24
      }
      defender: {
        logAnalyticsWorkspaceResourceId: null // Will be set via monitoring module
        securityMonitoring: {
          enabled: true
        }
      }
    }
    
    // Storage profile
    storageProfile: {
      diskCSIDriver: {
        enabled: true
      }
      fileCSIDriver: {
        enabled: true
      }
      snapshotController: {
        enabled: true
      }
    }
  }
}

// User node pool for general workloads
resource workloadNodePool 'Microsoft.ContainerService/managedClusters/agentPools@2024-01-01' = {
  parent: aksCluster
  name: 'workload'
  properties: {
    count: config.workloadNodeCount
    vmSize: config.workloadVmSize
    mode: 'User'
    osType: 'Linux'
    osSKU: 'Ubuntu'
    maxPods: 50
    type: 'VirtualMachineScaleSets'
    vnetSubnetID: subnetId
    enableAutoScaling: true
    minCount: config.workloadNodeMin
    maxCount: config.workloadNodeMax
    availabilityZones: environment == 'prod' ? ['1', '2', '3'] : ['1']
    upgradeSettings: {
      maxSurge: '33%'
    }
    nodeLabels: {
      'node-role.kubernetes.io/workload': 'true'
      'workload-type': 'general'
      'environment': environment
    }
    scaleSetPriority: 'Regular'
    scaleSetEvictionPolicy: 'Delete'
  }
}

// Spot instance node pool for cost optimization (following PRP requirement #13)
resource spotNodePool 'Microsoft.ContainerService/managedClusters/agentPools@2024-01-01' = if (environment != 'prod') {
  parent: aksCluster
  name: 'spot'
  properties: {
    count: 1
    vmSize: config.spotVmSize
    mode: 'User'
    osType: 'Linux'
    osSKU: 'Ubuntu'
    maxPods: 50
    type: 'VirtualMachineScaleSets'
    vnetSubnetID: subnetId
    enableAutoScaling: true
    minCount: config.spotNodeMin
    maxCount: config.spotNodeMax
    availabilityZones: environment == 'staging' ? ['1', '2', '3'] : ['1']
    upgradeSettings: {
      maxSurge: '33%'
    }
    nodeLabels: {
      'node-role.kubernetes.io/spot': 'true'
      'kubernetes.azure.com/scalesetpriority': 'spot'
      'environment': environment
    }
    nodeTaints: [
      'kubernetes.azure.com/scalesetpriority=spot:NoSchedule'
    ]
    scaleSetPriority: 'Spot'
    scaleSetEvictionPolicy: 'Delete'
    spotMaxPrice: -1 // Pay up to the current on-demand price
  }
}

// Role assignments for AKS managed identity
resource networkContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aksCluster.id, 'NetworkContributor')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4d97b98b-1d4f-4787-a291-c67834d212e7') // Network Contributor
    principalId: aksCluster.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output clusterName string = aksCluster.name
output clusterResourceId string = aksCluster.id
output clusterIdentityPrincipalId string = aksCluster.identity.principalId
output clusterOidcIssuerUrl string = aksCluster.properties.oidcIssuerProfile.issuerURL
output nodeResourceGroup string = aksCluster.properties.nodeResourceGroup
output clusterFqdn string = aksCluster.properties.fqdn

output cluster object = {
  name: aksCluster.name
  id: aksCluster.id
  principalId: aksCluster.identity.principalId
  oidcIssuerUrl: aksCluster.properties.oidcIssuerProfile.issuerURL
  nodeResourceGroup: aksCluster.properties.nodeResourceGroup
  fqdn: aksCluster.properties.fqdn
}