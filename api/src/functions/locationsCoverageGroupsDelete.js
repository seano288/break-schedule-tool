import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runLocationSettingsAction } from '../lib/settingsHttp.js';
import { deleteLocationCoverageGroup } from '../lib/settingsService.js';

export async function locationsCoverageGroupsDeleteHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const link = await facade.getUserLink(principal.userId);
    if (!link) {
        return { status: 303, headers: { location: '/api/onboarding' } };
    }

    const form = new URLSearchParams(await request.text());
    const target = { ...link, locationId: form.get('locationId') };
    return runLocationSettingsAction(facade, target, () =>
        deleteLocationCoverageGroup(facade, { ...target, id: form.get('id') })
    );
}

app.http('locationsCoverageGroupsDelete', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'locations/coverage-groups/delete',
    handler: locationsCoverageGroupsDeleteHandler
});
