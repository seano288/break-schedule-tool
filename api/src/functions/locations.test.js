import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import { fakeRequest } from '../../tests/fakeRequest.js';
import { locationsListHandler } from './locationsList.js';
import { locationsCreateHandler } from './locationsCreate.js';
import { locationsRenameHandler } from './locationsRename.js';
import { locationsArchiveHandler } from './locationsArchive.js';

// These handlers resolve TABLE_STORAGE_CONNECTION_STRING via getFacade() — set in
// vitest.config.js to point at the same test Azurite instance as this seeding facade.

describe('locations endpoints', () => {
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
            defaultCoverageGroups: [{ id: 1, name: 'Cashier', departments: [] }],
            defaultSettings: { jurisdiction: 'california', hoursByDay: {}, advanced: {} },
            createdAt: '2026-07-30T00:00:00.000Z'
        });
    }

    async function seedAdmin(companyId) {
        const userId = randomUUID();
        await seedFacade.createUserLink({
            userId, companyId, role: 'Admin', locationIds: [], createdAt: '2026-07-30T00:00:00.000Z'
        });
        return userId;
    }

    async function seedManager(companyId, locationIds) {
        const userId = randomUUID();
        await seedFacade.createUserLink({
            userId, companyId, role: 'Manager', locationIds, createdAt: '2026-07-30T00:00:00.000Z'
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

    describe('GET /api/locations', () => {
        it('401s when unauthenticated', async () => {
            const response = await locationsListHandler(fakeRequest());
            expect(response.status).toBe(401);
        });

        it('redirects to onboarding for an identity with no Company link', async () => {
            const response = await locationsListHandler(fakeRequest({ principal: principalFor(randomUUID()) }));
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/onboarding');
        });

        it('shows an Admin every Location under their Company, including archived ones', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            await seedLocation(company.id, { name: 'Active Store' });
            const archived = await seedLocation(company.id, { name: 'Archived Store' });
            await seedFacade.archiveLocation(company.id, archived.id);

            const response = await locationsListHandler(fakeRequest({ principal: principalFor(userId) }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Active Store');
            expect(response.body).toContain('Archived Store');
        });

        it('shows a Manager only the active Locations they are assigned to', async () => {
            const company = await seedCompany();
            const assigned = await seedLocation(company.id, { name: 'Mine' });
            await seedLocation(company.id, { name: 'Not Mine' });
            const userId = await seedManager(company.id, [assigned.id]);

            const response = await locationsListHandler(fakeRequest({ principal: principalFor(userId) }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Mine');
            expect(response.body).not.toContain('Not Mine');
        });
    });

    describe('POST /api/locations/create', () => {
        it('401s when unauthenticated', async () => {
            const response = await locationsCreateHandler(fakeRequest({ method: 'POST', body: 'name=Downtown' }));
            expect(response.status).toBe(401);
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const userId = await seedManager(company.id, []);

            const response = await locationsCreateHandler(fakeRequest({
                method: 'POST', principal: principalFor(userId), body: 'name=Downtown'
            }));

            expect(response.status).toBe(403);
        });

        it('creates the Location seeded from the Company template, and redirects', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);

            const response = await locationsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ name: 'Downtown' }).toString()
            }));

            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/locations');

            const locations = await seedFacade.listLocationsByCompany(company.id);
            expect(locations).toHaveLength(1);
            expect(locations[0].name).toBe('Downtown');
            expect(locations[0].coverageGroups).toEqual(company.defaultCoverageGroups);
            expect(locations[0].settings).toEqual(company.defaultSettings);
        });

        it('re-renders the list with a clear error for an empty name', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);

            const response = await locationsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ name: '' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('Location name is required');
        });
    });

    describe('POST /api/locations/rename', () => {
        it('401s when unauthenticated', async () => {
            const response = await locationsRenameHandler(fakeRequest({ method: 'POST', body: 'id=x&name=Y' }));
            expect(response.status).toBe(401);
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedManager(company.id, [location.id]);

            const response = await locationsRenameHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: location.id, name: 'New Name' }).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('renames the Location and redirects', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id, { name: 'Old Name' });

            const response = await locationsRenameHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: location.id, name: 'New Name' }).toString()
            }));

            expect(response.status).toBe(303);
            const found = await seedFacade.getLocation(company.id, location.id);
            expect(found.name).toBe('New Name');
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id);

            const response = await locationsRenameHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: foreignLocation.id, name: 'Hijacked' }).toString()
            }));

            expect(response.status).toBe(404);
            const found = await seedFacade.getLocation(companyB.id, foreignLocation.id);
            expect(found.name).toBe('Downtown');
        });
    });

    describe('POST /api/locations/archive', () => {
        it('401s when unauthenticated', async () => {
            const response = await locationsArchiveHandler(fakeRequest({ method: 'POST', body: 'id=x' }));
            expect(response.status).toBe(401);
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedManager(company.id, [location.id]);

            const response = await locationsArchiveHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: location.id }).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('archives the Location, excluding it from a Manager\'s active list, and redirects', async () => {
            const company = await seedCompany();
            const adminId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);
            const managerId = await seedManager(company.id, [location.id]);

            const response = await locationsArchiveHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(adminId),
                body: new URLSearchParams({ id: location.id }).toString()
            }));

            expect(response.status).toBe(303);

            const managerView = await locationsListHandler(fakeRequest({ principal: principalFor(managerId) }));
            expect(managerView.body).not.toContain(location.name);
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id);

            const response = await locationsArchiveHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: foreignLocation.id }).toString()
            }));

            expect(response.status).toBe(404);
            const found = await seedFacade.getLocation(companyB.id, foreignLocation.id);
            expect(found.archived).toBe(false);
        });
    });
});
