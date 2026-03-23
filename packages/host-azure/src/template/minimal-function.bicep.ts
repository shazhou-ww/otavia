/**
 * Minimal Linux consumption Function App + storage (Task 15 MVP).
 * `envSettings` keys become additional `appSettings` entries.
 */
export function buildMinimalFunctionBicep(): string {
  return `targetScope = 'resourceGroup'

param location string
param stackName string
param envSettings object = {}

var suffix = take(replace(uniqueString(resourceGroup().id, stackName), '-', ''), 13)
var storageName = take(toLower('ot\${suffix}'), 24)
var planName = 'plan-\${suffix}'
var functionName = 'func-\${suffix}'

resource stg 'Microsoft.Storage/storageAccounts@2022-09-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'Storage'
}

var endpointSuffix = environment().suffixes.storage
var storageConn = 'DefaultEndpointsProtocol=https;AccountName=\${stg.name};AccountKey=\${stg.listKeys().keys[0].value};EndpointSuffix=\${endpointSuffix}'

resource plan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {}
}

var baseAppSettings = [
  {
    name: 'AzureWebJobsStorage'
    value: storageConn
  }
  {
    name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
    value: storageConn
  }
  {
    name: 'WEBSITE_CONTENTSHARE'
    value: toLower(functionName)
  }
  {
    name: 'FUNCTIONS_EXTENSION_VERSION'
    value: '~4'
  }
  {
    name: 'FUNCTIONS_WORKER_RUNTIME'
    value: 'node'
  }
]

var extraAppSettings = [for item in items(envSettings): {
  name: item.key
  value: string(item.value)
}]

var allAppSettings = concat(baseAppSettings, extraAppSettings)

resource func 'Microsoft.Web/sites@2023-01-01' = {
  name: functionName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20'
      appSettings: allAppSettings
    }
  }
}
`;
}
