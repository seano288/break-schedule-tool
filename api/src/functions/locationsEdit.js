import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { assertLocationEditableByViewer } from '../lib/settingsService.js';
import { ScopeError } from '../lib/companyScope.js';
import { settingsErrorResponse } from '../lib/settingsHttp.js';
import { renderLocationEditPage } from '../lib/settingsView.js';

export async function locationsEditHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const link = await facade.getUserLink(principal.userId);
    if (!link) {
        return { status: 303, headers: { location: '/api/onboarding' } };
    }

    const locationId = request.query.get('id');
    let location;
    try {
        location = await assertLocationEditableByViewer(facade, { ...link, locationId });
    } catch (err) {
        if (err instanceof ScopeError) {
            return settingsErrorResponse(err);
        }
        throw err;
    }

    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderLocationEditPage({ location })
    };
}

app.http('locationsEdit', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'locations/edit',
    handler: locationsEditHandler
});
