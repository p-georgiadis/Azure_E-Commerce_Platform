// Example AKS cluster Bicep template with best practices
// This demonstrates proper configuration for production workloads

@description('The name of the AKS cluster')
param clusterName string

@description('The location of the AKS cluster')
param location string = resourceGroup().location

@description('The DNS prefix of the AKS cluster')
param dnsPrefix string = clusterName

@description('The size of the Virtual Machines')
@allowed([
  'Standard_D2s_v3'
  'Standard_D4s_v3'
  'Standard_D8s_v3'
])
param agentVMSize string = 'Standard_D4s_v3'

@description('The number of nodes for the cluster')
@minValue(1)
@maxValue(50)
param agentCount int = 3

@description('The maximum number of pods per node')
param maxPods int = 30

@description('The Log Analytics workspace resource ID')
param logAnalyticsWorkspaceResourceId string

@description('Tags to apply to the resources')
param tags object = {
  Environment: 'Production'
  Application: 'E-Commerce'
  ManagedBy: 'Bicep'
}

resource aksCluster 'Microsoft.ContainerService/managedClusters@2023-10-01' = {
  name: clusterName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: dnsPrefix
    kubernetesVersion: '1.28.3'
    enableRBAC: true
    
    // Network configuration
    networkProfile: {
      networkPlugin: 'azure'
      networkPolicy: 'calico'
      loadBalancerSku: 'Standard'
      serviceCidr: '10.0.0.0/16'
      dnsServiceIP: '10.0.0.10'
      dockerBridgeCidr: '172.17.0.1/16'
      outboundType: 'loadBalancer'
    }
    
    // System node pool
    agentPoolProfiles: [
      {
        name: 'systempool'
        count: agentCount
        vmSize: agentVMSize
        mode: 'System'
        osType: 'Linux'
        osSKU: 'Ubuntu'
        maxPods: maxPods
        type: 'VirtualMachineScaleSets'
        enableAutoScaling: true
        minCount: 1
        maxCount: 5
        availabilityZones: ['1', '2', '3']
        nodeLabels: {
          'node-role.kubernetes.io/system': 'true'
        }
        nodeTaints: [
          'CriticalAddonsOnly=true:NoSchedule'
        ]
      }
    ]
    
    // Add-ons configuration
    addonProfiles: {
      azureMonitor: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceId: logAnalyticsWorkspaceResourceId
        }
      }
      azurepolicy: {
        enabled: true
      }
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: {
          enableSecretRotation: 'true'
          rotationPollInterval: '2m'
        }
      }
    }
    
    // Security configuration
    apiServerAccessProfile: {
      enablePrivateCluster: false
      authorizedIPRanges: []
    }
    
    // Auto-upgrade configuration
    autoUpgradeProfile: {
      upgradeChannel: 'patch'
    }
    
    // Maintenance window
    maintenanceWindow: {
      schedule: {
        default: [
          {
            day: 'Sunday'
            intervalWeeks: 1
            startTime: '00:00'
            duration: 4
          }
        ]
      }
    }
  }
}

// User node pool for workloads
resource workloadNodePool 'Microsoft.ContainerService/managedClusters/agentPools@2023-10-01' = {
  parent: aksCluster
  name: 'workload'
  properties: {
    count: 3
    vmSize: agentVMSize
    mode: 'User'
    osType: 'Linux'
    osSKU: 'Ubuntu'
    maxPods: maxPods
    type: 'VirtualMachineScaleSets'
    enableAutoScaling: true
    minCount: 2
    maxCount: 10
    availabilityZones: ['1', '2', '3']
    nodeLabels: {
      'node-role.kubernetes.io/workload': 'true'
      'workload-type': 'general'
    }
    scaleSetPriority: 'Regular'
    scaleSetEvictionPolicy: 'Delete'
    upgradeSetting: {
      maxSurge: '33%'
    }
  }
}

// Spot instance node pool for cost optimization (non-critical workloads)
resource spotNodePool 'Microsoft.ContainerService/managedClusters/agentPools@2023-10-01' = {
  parent: aksCluster
  name: 'spot'
  properties: {
    count: 1
    vmSize: 'Standard_D4s_v3'
    mode: 'User'
    osType: 'Linux'
    osSKU: 'Ubuntu'
    maxPods: maxPods
    type: 'VirtualMachineScaleSets'
    enableAutoScaling: true
    minCount: 0
    maxCount: 5
    availabilityZones: ['1', '2', '3']
    nodeLabels: {
      'node-role.kubernetes.io/spot': 'true'
      'kubernetes.azure.com/scalesetpriority': 'spot'
    }
    nodeTaints: [
      'kubernetes.azure.com/scalesetpriority=spot:NoSchedule'
    ]
    scaleSetPriority: 'Spot'
    scaleSetEvictionPolicy: 'Delete'
    spotMaxPrice: -1
  }
}

// Outputs
output clusterName string = aksCluster.name
output clusterResourceId string = aksCluster.id
output clusterIdentityPrincipalId string = aksCluster.identity.principalId
output nodeResourceGroup string = aksCluster.properties.nodeResourceGroup