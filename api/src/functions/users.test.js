import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import { fakeRequest } from '../../tests/fakeRequest.js';
import { usersListHandler } from './usersList.js';
import { usersInviteHandler } from './usersInvite.js';
import { usersRoleHandler } from './usersRole.js';
import { usersRevokeHandler } from './usersRevoke.js';
import { onboardingStatusHandler } from './onboardingStatus.js';
import { locationsListHandler } from './locationsList.js';
import { onboardingRedeemInviteHandler } from './onboardingRedeemInvite.js';

// These handlers resolve TABLE_STORAGE_CONNECTION_STRING via getFacade() — set in
// vitest.config.js to point at the same test Azurite instance as this seeding facade.

describe('users endpoints', () => {
    /** @type {TableStorageFacade} */
    let seedFacade;

    beforeAll(async () => {
        seedFacade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await seedFacade.init();
    });

    function principalFor(userId) {
        return { identityProvider: 'aad', userId, userDetails: `${userId}@example.com` };
    }

    async function seedCompany() {
        return seedFacade.createCompany({
            id: randomUUID(),
            name: 'Acme Outfitters',
            subscriptionStatus: 'trial',
            defaultCoverageGroups: [],
            defaultSettings: {},
            createdAt: '2026-07-30T00:00:00.000Z'
        });
    }

    async function seedAdmin(companyId) {
        const userId = randomUUID();
        await seedFacade.createUserLink({
            userId, companyId, role: 'Admin', locationIds: [], userDetails: `${userId}@example.com`,
            createdAt: '2026-07-30T00:00:00.000Z'
        });
        return userId;
    }

    async function seedManager(companyId) {
        const userId = randomUUID();
        await seedFacade.createUserLink({
            userId, companyId, role: 'Manager', locationIds: [], userDetails: `${userId}@example.com`,
            createdAt: '2026-07-30T00:00:00.000Z'
        });
        return userId;
    }

    async function seedLocation(companyId, overrides = {}) {
        return seedFacade.createLocation({
            id: randomUUID(),
            companyId,
            name: 'Downtown',
            coverageGroups: [],
            settings: {},
            createdAt: '2026-07-30T00:00:00.000Z',
            ...overrides
        });
    }

    describe('GET /api/users', () => {
        it('401s when unauthenticated', async () => {
            const response = await usersListHandler(fakeRequest());
            expect(response.status).toBe(401);
        });

        it('redirects to onboarding for an identity with no Company link', async () => {
            const response = await usersListHandler(fakeRequest({ principal: principalFor(randomUUID()) }));
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/onboarding');
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const userId = await seedManager(company.id);

            const response = await usersListHandler(fakeRequest({ principal: principalFor(userId) }));

            expect(response.status).toBe(403);
        });

        it('shows an Admin every User on the Company with their role', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const managerId = await seedManager(company.id);

            const response = await usersListHandler(fakeRequest({ principal: principalFor(adminId) }));

            expect(response.status).toBe(200);
            expect(response.body).toContain(`${adminId}@example.com`);
            expect(response.body).toContain(`${managerId}@example.com`);
        });
    });

    describe('POST /api/users/invite', () => {
        it('401s when unauthenticated', async () => {
            const response = await usersInviteHandler(fakeRequest({ method: 'POST', body: 'role=Manager' }));
            expect(response.status).toBe(401);
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const userId = await seedManager(company.id);

            const response = await usersInviteHandler(fakeRequest({
                method: 'POST', principal: principalFor(userId), body: 'role=Manager'
            }));

            expect(response.status).toBe(403);
        });

        it('generates a Company-wide invite code for an Admin invite and shows it to the Admin', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);

            const response = await usersInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ role: 'Admin' }).toString()
            }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Invite code');
            expect(response.body).toContain('Admin');
        });

        it('forces locationIds to empty for an Admin invite even if Locations were submitted', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await usersInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams([['role', 'Admin'], ['locationIds', location.id]]).toString()
            }));

            expect(response.status).toBe(200);
        });

        it('generates a Manager invite scoped to the submitted Locations', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await usersInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams([['role', 'Manager'], ['locationIds', location.id]]).toString()
            }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Invite code');
            expect(response.body).toContain('Manager');
        });

        it('blocks a Manager invite with no Locations selected, server-side', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);

            const response = await usersInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ role: 'Manager' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('Select at least one Location');
        });

        it('rejects a Manager invite naming a Location from a different Company, failing the whole request', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const adminId = await seedAdmin(companyA.id);
            const ownLocation = await seedLocation(companyA.id);
            const foreignLocation = await seedLocation(companyB.id);

            const response = await usersInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams([
                    ['role', 'Manager'],
                    ['locationIds', ownLocation.id],
                    ['locationIds', foreignLocation.id]
                ]).toString()
            }));

            expect(response.status).toBe(404);
        });

        it('re-renders the list with a clear error for an invalid role', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);

            const response = await usersInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ role: 'Owner' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('Role must be Admin or Manager');
        });

        it('persists the submitted locationIds so redeeming produces a Manager scoped to exactly those Locations', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const locationA = await seedLocation(company.id, { name: 'Downtown' });
            const locationB = await seedLocation(company.id, { name: 'Uptown' });

            const inviteResponse = await usersInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams([
                    ['role', 'Manager'],
                    ['locationIds', locationA.id],
                    ['locationIds', locationB.id]
                ]).toString()
            }));
            expect(inviteResponse.status).toBe(200);

            const codeMatch = inviteResponse.body.match(/Invite code for Manager: ([\w-]+)/);
            expect(codeMatch).not.toBeNull();
            const code = codeMatch[1];

            const newUserId = randomUUID();
            const redeemResponse = await onboardingRedeemInviteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(newUserId),
                body: new URLSearchParams({ code }).toString()
            }));

            expect(redeemResponse.status).toBe(303);
            const link = await seedFacade.getUserLink(newUserId);
            expect(link.role).toBe('Manager');
            expect(link.locationIds.sort()).toEqual([locationA.id, locationB.id].sort());
        });
    });

    describe('POST /api/users/role', () => {
        it('401s when unauthenticated', async () => {
            const response = await usersRoleHandler(fakeRequest({ method: 'POST', body: 'userId=x&role=Admin' }));
            expect(response.status).toBe(401);
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const managerId = await seedManager(company.id);

            const response = await usersRoleHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(managerId),
                body: new URLSearchParams({ userId: managerId, role: 'Admin' }).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('changes a User\'s role and redirects', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const managerId = await seedManager(company.id);

            const response = await usersRoleHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ userId: managerId, role: 'Admin' }).toString()
            }));

            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/users');
            expect((await seedFacade.getUserLink(managerId)).role).toBe('Admin');
        });

        it('404s for a userId belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const adminId = await seedAdmin(companyA.id);
            const foreignUserId = await seedManager(companyB.id);

            const response = await usersRoleHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ userId: foreignUserId, role: 'Admin' }).toString()
            }));

            expect(response.status).toBe(404);
            expect((await seedFacade.getUserLink(foreignUserId)).role).toBe('Manager');
        });
    });

    describe('POST /api/users/revoke', () => {
        it('401s when unauthenticated', async () => {
            const response = await usersRevokeHandler(fakeRequest({ method: 'POST', body: 'userId=x' }));
            expect(response.status).toBe(401);
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const managerId = await seedManager(company.id);

            const response = await usersRevokeHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(managerId),
                body: new URLSearchParams({ userId: managerId }).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('revokes a User\'s access and redirects', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const managerId = await seedManager(company.id);

            const response = await usersRevokeHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ userId: managerId }).toString()
            }));

            expect(response.status).toBe(303);
            expect(await seedFacade.getUserLink(managerId)).toBeNull();
        });

        it('404s for a userId belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const adminId = await seedAdmin(companyA.id);
            const foreignUserId = await seedManager(companyB.id);

            const response = await usersRevokeHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ userId: foreignUserId }).toString()
            }));

            expect(response.status).toBe(404);
            expect(await seedFacade.getUserLink(foreignUserId)).not.toBeNull();
        });

        it('immediately routes a revoked User back to the create-or-join screen', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const managerId = await seedManager(company.id);

            await usersRevokeHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ userId: managerId }).toString()
            }));

            const locationsResponse = await locationsListHandler(fakeRequest({ principal: principalFor(managerId) }));
            expect(locationsResponse.status).toBe(303);
            expect(locationsResponse.headers.location).toBe('/api/onboarding');

            const onboardingResponse = await onboardingStatusHandler(fakeRequest({ principal: principalFor(managerId) }));
            expect(onboardingResponse.status).toBe(200);
            expect(onboardingResponse.body).toContain('/api/onboarding/create-company');
        });
    });
});
