import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runLocationAction } from '../lib/locationHttp.js';
import { renameCompanyLocation } from '../lib/locationService.js';

export async function locationsRenameHandler(request) {
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
        renameCompanyLocation(facade, { companyId: link.companyId, locationId: form.get('id'), name: form.get('name') })
    );
}

app.http('locationsRename', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'locations/rename',
    handler: locationsRenameHandler
});
