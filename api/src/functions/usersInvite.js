import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runUserInviteAction } from '../lib/userHttp.js';
import { createInviteForCompany } from '../lib/userService.js';

export async function usersInviteHandler(request) {
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
    return runUserInviteAction(facade, link, () =>
        createInviteForCompany(facade, {
            companyId: link.companyId,
            role: form.get('role'),
            locationIds: form.getAll('locationIds')
        })
    );
}

app.http('usersInvite', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'users/invite',
    handler: usersInviteHandler
});
