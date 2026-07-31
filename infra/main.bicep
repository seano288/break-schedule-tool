targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment used to generate a unique resource group name and resource tags')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

var tags = {
    'azd-env-name': environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
    name: '${environmentName}-rg'
    location: location
    tags: tags
}

module storage './app/storage.bicep' = {
    name: 'storage'
    scope: rg
    params: {
        name: 'st${uniqueString(rg.id)}'
        location: location
        tags: tags
    }
}

module web './app/web.bicep' = {
    name: 'web'
    scope: rg
    params: {
        name: '${environmentName}-web'
        location: location
        tags: tags
        tableStorageConnectionString: storage.outputs.connectionString
    }
}

output AZURE_LOCATION string = location
output WEB_URI string = web.outputs.uri
