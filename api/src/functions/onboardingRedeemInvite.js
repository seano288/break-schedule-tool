import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runOnboardingAction } from '../lib/onboardingHttp.js';
import { redeemInviteForUser } from '../lib/onboardingService.js';

export async function onboardingRedeemInviteHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const form = new URLSearchParams(await request.text());
    const facade = await getFacade();

    return runOnboardingAction(() => redeemInviteForUser(facade, {
        userId: principal.userId,
        userDetails: principal.userDetails,
        code: form.get('code')
    }));
}

app.http('onboardingRedeemInvite', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'onboarding/redeem-invite',
    handler: onboardingRedeemInviteHandler
});
