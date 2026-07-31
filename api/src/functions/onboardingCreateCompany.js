import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runOnboardingAction } from '../lib/onboardingHttp.js';
import { createCompanyForUser } from '../lib/onboardingService.js';

export async function onboardingCreateCompanyHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const form = new URLSearchParams(await request.text());
    const facade = await getFacade();

    return runOnboardingAction(() => createCompanyForUser(facade, {
        userId: principal.userId,
        userDetails: principal.userDetails,
        name: form.get('name')
    }));
}

app.http('onboardingCreateCompany', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'onboarding/create-company',
    handler: onboardingCreateCompanyHandler
});
