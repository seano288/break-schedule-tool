import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runUserAction } from '../lib/userHttp.js';
import { updateUserRoleAndLocations } from '../lib/userService.js';

export async function usersEditHandler(request) {
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
    return runUserAction(facade, link, () =>
        updateUserRoleAndLocations(facade, {
            companyId: link.companyId,
            userId: form.get('userId'),
            role: form.get('role'),
            locationIds: form.getAll('locationIds')
        })
    );
}

app.http('usersEdit', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'users/edit',
    handler: usersEditHandler
});
