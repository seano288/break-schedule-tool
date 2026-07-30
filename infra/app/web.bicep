param name string
param location string = resourceGroup().location
param tags object = {}

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

output uri string = 'https://${web.properties.defaultHostname}'
output name string = web.name
