/**
 * Minimal Linux consumption Function App + storage (Task 15 MVP).
 * Optional Cosmos DB (Table API) + OTAVIA_TABLE_* app settings when `resourceTables` is non-empty.
 */

export type ResourceTableDeploy = {
  logicalId: string;
  partitionKeyAttr: string;
  rowKeyAttr: string;
  envSuffix: string;
};

const LEGACY_BICEP = `targetScope = 'resourceGroup'

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

const BICEP_WITH_TABLES = `targetScope = 'resourceGroup'

param location string
param stackName string
param envSettings object = {}
param resourceTables array

var suffix = take(replace(uniqueString(resourceGroup().id, stackName), '-', ''), 13)
var storageName = take(toLower('ot\${suffix}'), 24)
var planName = 'plan-\${suffix}'
var functionName = 'func-\${suffix}'
var cosmosName = take(toLower('cosm\${suffix}'), 24)

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

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableTable'
      }
    ]
  }
}

resource tableSvc 'Microsoft.DocumentDB/databaseAccounts/tableServices@2022-05-15' = {
  parent: cosmos
  name: 'default'
}

resource cosmosTables 'Microsoft.DocumentDB/databaseAccounts/tableServices/tables@2022-05-15' = [for t in resourceTables: {
  parent: tableSvc
  name: t.logicalId
  properties: {
    resource: {
      id: t.logicalId
    }
  }
}]

var cosmosTableEndpoint = 'https://\${cosmos.name}.table.cosmos.azure.com'
var cosmosPrimaryKey = cosmos.listKeys().primaryMasterKey

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

var tableEnvBlocks = [for t in resourceTables: [
  {
    name: 'OTAVIA_TABLE_\${t.envSuffix}_ENDPOINT'
    value: cosmosTableEndpoint
  }
  {
    name: 'OTAVIA_TABLE_\${t.envSuffix}_NAME'
    value: t.logicalId
  }
  {
    name: 'OTAVIA_TABLE_\${t.envSuffix}_PARTITION_KEY'
    value: t.partitionKeyAttr
  }
  {
    name: 'OTAVIA_TABLE_\${t.envSuffix}_ROW_KEY'
    value: t.rowKeyAttr
  }
  {
    name: 'OTAVIA_TABLE_\${t.envSuffix}_KEY'
    value: cosmosPrimaryKey
  }
]]

var tableEnvFlat = flatten(tableEnvBlocks)

var allAppSettings = concat(baseAppSettings, extraAppSettings, tableEnvFlat)

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

export function buildMinimalFunctionBicep(input?: { resourceTables?: ReadonlyArray<ResourceTableDeploy> }): string {
  const tables = input?.resourceTables ?? [];
  return tables.length > 0 ? BICEP_WITH_TABLES : LEGACY_BICEP;
}
