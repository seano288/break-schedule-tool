import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import { fakeRequest } from '../../tests/fakeRequest.js';
import { onboardingStatusHandler } from './onboardingStatus.js';
import { onboardingCreateCompanyHandler } from './onboardingCreateCompany.js';
import { onboardingRedeemInviteHandler } from './onboardingRedeemInvite.js';

// These handlers resolve TABLE_STORAGE_CONNECTION_STRING via getFacade() — set in
// vitest.config.js to point at the same test Azurite instance as this seeding facade.

describe('onboarding endpoints', () => {
    /** @type {TableStorageFacade} */
    let seedFacade;

    beforeAll(async () => {
        seedFacade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await seedFacade.init();
    });

    function principalFor(userId) {
        return { identityProvider: 'aad', userId, userDetails: `${userId}@example.com` };
    }

    describe('GET /api/onboarding', () => {
        it('401s when unauthenticated', async () => {
            const response = await onboardingStatusHandler(fakeRequest());
            expect(response.status).toBe(401);
        });

        it('shows the create-or-join screen for an unlinked identity', async () => {
            const response = await onboardingStatusHandler(fakeRequest({ principal: principalFor(randomUUID()) }));
            expect(response.status).toBe(200);
            expect(response.body).toContain('/api/onboarding/create-company');
        });

        it('shows the linked placeholder once the identity has a Company', async () => {
            const userId = randomUUID();
            await onboardingCreateCompanyHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ name: 'Acme Outfitters' }).toString()
            }));

            const response = await onboardingStatusHandler(fakeRequest({ principal: principalFor(userId) }));
            expect(response.status).toBe(200);
            expect(response.body).toContain('Acme Outfitters');
            expect(response.body).not.toContain('/api/onboarding/create-company');
        });
    });

    describe('POST /api/onboarding/create-company', () => {
        it('401s when unauthenticated', async () => {
            const response = await onboardingCreateCompanyHandler(fakeRequest({ method: 'POST', body: 'name=Acme' }));
            expect(response.status).toBe(401);
        });

        it('provisions the Company, makes the creator Admin, and redirects', async () => {
            const userId = randomUUID();
            const response = await onboardingCreateCompanyHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ name: 'Acme Outfitters' }).toString()
            }));

            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/onboarding');

            const link = await seedFacade.getUserLink(userId);
            expect(link.role).toBe('Admin');
        });

        it('re-renders the form with a clear error for an empty name', async () => {
            const response = await onboardingCreateCompanyHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(randomUUID()),
                body: new URLSearchParams({ name: '' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('Company name is required');
        });
    });

    describe('POST /api/onboarding/redeem-invite', () => {
        async function seedInvite(overrides = {}) {
            const code = randomUUID();
            const company = await seedFacade.createCompany({
                id: randomUUID(),
                name: 'Invited-to Co',
                subscriptionStatus: 'trial',
                defaultCoverageGroups: [],
                defaultSettings: {},
                createdAt: '2026-07-30T00:00:00.000Z'
            });
            await seedFacade.createInviteCode({
                code,
                companyId: company.id,
                role: 'Manager',
                locationIds: ['loc-1'],
                expiresAt: '2099-01-01T00:00:00.000Z',
                createdAt: '2026-07-30T00:00:00.000Z',
                ...overrides
            });
            return code;
        }

        it('401s when unauthenticated', async () => {
            const response = await onboardingRedeemInviteHandler(fakeRequest({ method: 'POST', body: 'code=abc' }));
            expect(response.status).toBe(401);
        });

        it('attaches the identity with the invite\'s role and redirects', async () => {
            const code = await seedInvite();
            const userId = randomUUID();

            const response = await onboardingRedeemInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ code }).toString()
            }));

            expect(response.status).toBe(303);
            const link = await seedFacade.getUserLink(userId);
            expect(link.role).toBe('Manager');
        });

        it('fails clearly for an expired code', async () => {
            const code = await seedInvite({ expiresAt: '2000-01-01T00:00:00.000Z' });

            const response = await onboardingRedeemInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(randomUUID()),
                body: new URLSearchParams({ code }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('expired');
        });

        it('fails clearly for an already-used code', async () => {
            const code = await seedInvite();
            await onboardingRedeemInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(randomUUID()),
                body: new URLSearchParams({ code }).toString()
            }));

            const response = await onboardingRedeemInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(randomUUID()),
                body: new URLSearchParams({ code }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('already been used');
        });
    });
});
