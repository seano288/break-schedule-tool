import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runLocationAction } from '../lib/locationHttp.js';
import { createLocationForCompany } from '../lib/locationService.js';

export async function locationsCreateHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const link = await facade.getUserLink(principal.userId);
    if (!link) {
        return { status: 303, headers: { location: '/api/onboarding' } };
    }
    if (link.role !== 'Admin') {
        return { status: 403, jsonBody: { error: 'Forbidden' } };
    }

    const form = new URLSearchParams(await request.text());
    return runLocationAction(facade, link, () =>
        createLocationForCompany(facade, { companyId: link.companyId, name: form.get('name') })
    );
}

app.http('locationsCreate', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'locations/create',
    handler: locationsCreateHandler
});
