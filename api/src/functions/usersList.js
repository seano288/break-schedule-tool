import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { listInvitableLocations, listUsersForCompany } from '../lib/userService.js';
import { renderUsersPage } from '../lib/userView.js';

export async function usersListHandler(request) {
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

    const users = await listUsersForCompany(facade, { companyId: link.companyId });
    const locations = await listInvitableLocations(facade, { companyId: link.companyId });
    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderUsersPage({ users, locations })
    };
}

app.http('usersList', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users',
    handler: usersListHandler
});
