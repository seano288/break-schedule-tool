import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { listLocationsForViewer } from '../lib/locationService.js';
import { renderWizardSelectPage } from '../lib/wizardView.js';

export async function wizardSelectHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const link = await facade.getUserLink(principal.userId);
    if (!link) {
        return { status: 303, headers: { location: '/api/onboarding' } };
    }

    const locations = await listLocationsForViewer(facade, link);
    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderWizardSelectPage({ locations })
    };
}

app.http('wizardSelect', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'wizard',
    handler: wizardSelectHandler
});
