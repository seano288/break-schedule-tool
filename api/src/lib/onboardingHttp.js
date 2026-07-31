import { OnboardingError } from './onboardingService.js';
import { renderCreateOrJoinPage } from './onboardingView.js';

/**
 * Runs an onboarding action (create-company / redeem-invite) and maps the shared
 * result shape: a 303 to the onboarding status page on success, or the
 * create-or-join form re-rendered with a clear error on an expected failure.
 *
 * @param {() => Promise<void>} action
 */
export async function runOnboardingAction(action) {
    try {
        await action();
    } catch (err) {
        if (err instanceof OnboardingError) {
            return { status: 400, headers: { 'content-type': 'text/html' }, body: renderCreateOrJoinPage({ error: err.message }) };
        }
        throw err;
    }

    return { status: 303, headers: { location: '/api/onboarding' } };
}
