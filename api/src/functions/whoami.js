import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';

app.http('whoami', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'whoami',
    handler: async (request) => {
        const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));

        if (!principal) {
            return { status: 401, jsonBody: { error: 'Unauthenticated' } };
        }

        return { status: 200, jsonBody: principal };
    }
});
