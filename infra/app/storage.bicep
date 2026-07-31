param name string
param location string = resourceGroup().location
param tags object = {}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
    name: name
    location: location
    tags: tags
    kind: 'StorageV2'
    sku: {
        name: 'Standard_LRS'
    }
    properties: {
        minimumTlsVersion: 'TLS1_2'
        allowBlobPublicAccess: false
    }
}

@secure()
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
output name string = storage.name
