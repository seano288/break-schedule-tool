import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { getLinkStatus } from '../lib/onboardingService.js';
import { renderCreateOrJoinPage, renderLinkedPage } from '../lib/onboardingView.js';

export async function onboardingStatusHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const status = await getLinkStatus(facade, principal.userId);

    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: status.linked ? renderLinkedPage(status) : renderCreateOrJoinPage()
    };
}

app.http('onboardingStatus', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'onboarding',
    handler: onboardingStatusHandler
});
