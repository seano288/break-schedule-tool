param name string
param location string = resourceGroup().location
param tags object = {}
@secure()
param tableStorageConnectionString string

resource web 'Microsoft.Web/staticSites@2023-12-01' = {
    name: name
    location: location
    tags: union(tags, { 'azd-service-name': 'web' })
    sku: {
        name: 'Free'
        tier: 'Free'
    }
    properties: {
        stagingEnvironmentPolicy: 'Enabled'
        allowConfigFileUpdates: true
    }
}

// Exposed as environment variables to the linked managed Functions API (not the
// static content) — read by api/src/lib/facade.js as TABLE_STORAGE_CONNECTION_STRING.
resource functionAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
    parent: web
    name: 'functionappsettings'
    properties: {
        TABLE_STORAGE_CONNECTION_STRING: tableStorageConnectionString
    }
}

output uri string = 'https://${web.properties.defaultHostname}'
output name string = web.name
