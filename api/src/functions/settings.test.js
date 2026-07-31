import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import { fakeRequest } from '../../tests/fakeRequest.js';
import { locationsEditHandler } from './locationsEdit.js';
import { locationsCoverageGroupsCreateHandler } from './locationsCoverageGroupsCreate.js';
import { locationsCoverageGroupsUpdateHandler } from './locationsCoverageGroupsUpdate.js';
import { locationsCoverageGroupsDeleteHandler } from './locationsCoverageGroupsDelete.js';
import { locationsHoursHandler } from './locationsHours.js';
import { companyTemplateHandler } from './companyTemplate.js';
import { companyTemplateCoverageGroupsCreateHandler } from './companyTemplateCoverageGroupsCreate.js';
import { companyTemplateCoverageGroupsUpdateHandler } from './companyTemplateCoverageGroupsUpdate.js';
import { companyTemplateCoverageGroupsDeleteHandler } from './companyTemplateCoverageGroupsDelete.js';
import { companyTemplateHoursHandler } from './companyTemplateHours.js';

// These handlers resolve TABLE_STORAGE_CONNECTION_STRING via getFacade() — set in
// vitest.config.js to point at the same test Azurite instance as this seeding facade.

const VALID_HOURS_FORM = {
    monday_start: '09:00', monday_end: '17:00',
    tuesday_start: '09:00', tuesday_end: '17:00',
    wednesday_start: '09:00', wednesday_end: '17:00',
    thursday_start: '09:00', thursday_end: '17:00',
    friday_start: '09:00', friday_end: '17:00',
    saturday_start: '10:00', saturday_end: '15:00',
    sunday_start: '10:00', sunday_end: '15:00'
};

describe('settings endpoints', () => {
    /** @type {TableStorageFacade} */
    let seedFacade;

    beforeAll(async () => {
        seedFacade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await seedFacade.init();
    });

    function principalFor(userId) {
        return { identityProvider: 'aad', userId, userDetails: `${userId}@example.com` };
    }

    async function seedCompany(overrides = {}) {
        return seedFacade.createCompany({
            id: randomUUID(),
            name: 'Acme Outfitters',
            subscriptionStatus: 'trial',
            defaultCoverageGroups: [],
            defaultSettings: { jurisdiction: 'california', hoursByDay: {}, advanced: {} },
            createdAt: '2026-07-30T00:00:00.000Z',
            ...overrides
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
            settings: { jurisdiction: 'california', hoursByDay: {}, advanced: {} },
            createdAt: '2026-07-30T00:00:00.000Z',
            ...overrides
        });
    }

    describe('GET /api/locations/edit', () => {
        it('401s when unauthenticated', async () => {
            const response = await locationsEditHandler(fakeRequest({ query: { id: 'x' } }));
            expect(response.status).toBe(401);
        });

        it('redirects to onboarding for an identity with no Company link', async () => {
            const response = await locationsEditHandler(fakeRequest({
                principal: principalFor(randomUUID()), query: { id: 'x' }
            }));
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/onboarding');
        });

        it('404s for an unknown location id', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);

            const response = await locationsEditHandler(fakeRequest({
                principal: principalFor(userId), query: { id: randomUUID() }
            }));

            expect(response.status).toBe(404);
        });

        it('403s for a Manager not assigned to the Location', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedManager(company.id, []);

            const response = await locationsEditHandler(fakeRequest({
                principal: principalFor(userId), query: { id: location.id }
            }));

            expect(response.status).toBe(403);
        });

        it('shows the Location\'s coverage groups and hours to an Admin', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id, {
                name: 'Downtown',
                coverageGroups: [{ id: 1, name: 'Cashier', departments: [{ main: 'Front', sub: 'Cashier' }] }]
            });

            const response = await locationsEditHandler(fakeRequest({
                principal: principalFor(userId), query: { id: location.id }
            }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Downtown');
            expect(response.body).toContain('Cashier');
        });

        it('shows the Location to a Manager assigned to it', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedManager(company.id, [location.id]);

            const response = await locationsEditHandler(fakeRequest({
                principal: principalFor(userId), query: { id: location.id }
            }));

            expect(response.status).toBe(200);
        });
    });

    describe('POST /api/locations/coverage-groups/create', () => {
        it('401s when unauthenticated', async () => {
            const response = await locationsCoverageGroupsCreateHandler(fakeRequest({ method: 'POST', body: 'locationId=x' }));
            expect(response.status).toBe(401);
        });

        it('403s for a Manager not assigned to the Location', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedManager(company.id, []);

            const response = await locationsCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, name: 'Cashier', departments: 'Front | Cashier' }).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id);

            const response = await locationsCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: foreignLocation.id, name: 'Cashier', departments: 'Front | Cashier' }).toString()
            }));

            expect(response.status).toBe(404);
            const found = await seedFacade.getLocation(companyB.id, foreignLocation.id);
            expect(found.coverageGroups).toEqual([]);
        });

        it('lets a Manager assigned to the Location add a coverage group, and redirects', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedManager(company.id, [location.id]);

            const response = await locationsCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, name: 'Cashier', departments: 'Front | Cashier\nFront | Returns' }).toString()
            }));

            expect(response.status).toBe(303);
            expect(response.headers.location).toBe(`/api/locations/edit?id=${location.id}`);

            const found = await seedFacade.getLocation(company.id, location.id);
            expect(found.coverageGroups).toEqual([
                { id: 1, name: 'Cashier', departments: [{ main: 'Front', sub: 'Cashier' }, { main: 'Front', sub: 'Returns' }] }
            ]);
        });

        it('re-renders the edit page with a clear error for an empty name', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await locationsCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, name: '', departments: 'Front | Cashier' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('Coverage group name is required');
        });

        it('re-renders the edit page with a clear error for malformed departments text', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await locationsCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, name: 'Cashier', departments: 'not a valid line' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('Main | Sub');
        });
    });

    describe('POST /api/locations/coverage-groups/update', () => {
        it('updates an existing coverage group', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id, {
                coverageGroups: [{ id: 1, name: 'Old Name', departments: [{ main: 'Front', sub: 'Cashier' }] }]
            });

            const response = await locationsCoverageGroupsUpdateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, id: '1', name: 'New Name', departments: 'Back | Stockroom' }).toString()
            }));

            expect(response.status).toBe(303);
            const found = await seedFacade.getLocation(company.id, location.id);
            expect(found.coverageGroups).toEqual([{ id: 1, name: 'New Name', departments: [{ main: 'Back', sub: 'Stockroom' }] }]);
        });

        it('404s for an unknown coverage group id', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await locationsCoverageGroupsUpdateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, id: '99', name: 'X', departments: 'A | B' }).toString()
            }));

            expect(response.status).toBe(404);
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id, {
                coverageGroups: [{ id: 1, name: 'Original', departments: [] }]
            });

            const response = await locationsCoverageGroupsUpdateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: foreignLocation.id, id: '1', name: 'Hijacked', departments: 'A | B' }).toString()
            }));

            expect(response.status).toBe(404);
            const found = await seedFacade.getLocation(companyB.id, foreignLocation.id);
            expect(found.coverageGroups).toEqual([{ id: 1, name: 'Original', departments: [] }]);
        });
    });

    describe('POST /api/locations/coverage-groups/delete', () => {
        it('deletes an existing coverage group, and redirects', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id, {
                coverageGroups: [{ id: 1, name: 'Cashier', departments: [] }]
            });

            const response = await locationsCoverageGroupsDeleteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, id: '1' }).toString()
            }));

            expect(response.status).toBe(303);
            const found = await seedFacade.getLocation(company.id, location.id);
            expect(found.coverageGroups).toEqual([]);
        });

        it('404s for an unknown coverage group id', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await locationsCoverageGroupsDeleteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, id: '99' }).toString()
            }));

            expect(response.status).toBe(404);
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id, {
                coverageGroups: [{ id: 1, name: 'Original', departments: [] }]
            });

            const response = await locationsCoverageGroupsDeleteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: foreignLocation.id, id: '1' }).toString()
            }));

            expect(response.status).toBe(404);
            const found = await seedFacade.getLocation(companyB.id, foreignLocation.id);
            expect(found.coverageGroups).toEqual([{ id: 1, name: 'Original', departments: [] }]);
        });
    });

    describe('POST /api/locations/hours', () => {
        it('sets per-day operating hours, leaving coverage groups untouched, and redirects', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id, {
                coverageGroups: [{ id: 1, name: 'Cashier', departments: [] }]
            });

            const response = await locationsHoursHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, ...VALID_HOURS_FORM }).toString()
            }));

            expect(response.status).toBe(303);
            const found = await seedFacade.getLocation(company.id, location.id);
            expect(found.settings.hoursByDay.monday).toEqual({ start: '09:00', end: '17:00' });
            expect(found.settings.hoursByDay.sunday).toEqual({ start: '10:00', end: '15:00' });
            expect(found.coverageGroups).toEqual([{ id: 1, name: 'Cashier', departments: [] }]);
        });

        it('re-renders the edit page with a clear error for an invalid time', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await locationsHoursHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, ...VALID_HOURS_FORM, monday_start: 'noon' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('valid HH:MM hours');
        });

        it('re-renders the edit page with a clear error when start is after end', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await locationsHoursHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: location.id, ...VALID_HOURS_FORM, monday_start: '18:00', monday_end: '09:00' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('start time must be before its end time');
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id);

            const response = await locationsHoursHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: foreignLocation.id, ...VALID_HOURS_FORM }).toString()
            }));

            expect(response.status).toBe(404);
            const found = await seedFacade.getLocation(companyB.id, foreignLocation.id);
            expect(found.settings.hoursByDay).toEqual({});
        });
    });

    describe('editing one Location never affects another', () => {
        it('leaves a sibling Location\'s coverage groups and hours untouched', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const locationA = await seedLocation(company.id, {
                name: 'A Store',
                coverageGroups: [{ id: 1, name: 'Original', departments: [] }]
            });
            const locationB = await seedLocation(company.id, {
                name: 'B Store',
                coverageGroups: [{ id: 1, name: 'Original', departments: [] }]
            });

            await locationsCoverageGroupsUpdateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: locationA.id, id: '1', name: 'Changed', departments: 'A | B' }).toString()
            }));
            await locationsHoursHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ locationId: locationA.id, ...VALID_HOURS_FORM }).toString()
            }));

            const foundB = await seedFacade.getLocation(company.id, locationB.id);
            expect(foundB.coverageGroups).toEqual([{ id: 1, name: 'Original', departments: [] }]);
            expect(foundB.settings.hoursByDay).toEqual({});
        });
    });

    describe('GET /api/company/template', () => {
        it('401s when unauthenticated', async () => {
            const response = await companyTemplateHandler(fakeRequest());
            expect(response.status).toBe(401);
        });

        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const userId = await seedManager(company.id, []);

            const response = await companyTemplateHandler(fakeRequest({ principal: principalFor(userId) }));

            expect(response.status).toBe(403);
        });

        it('shows the Company\'s default coverage groups and hours to an Admin', async () => {
            const company = await seedCompany({
                defaultCoverageGroups: [{ id: 1, name: 'Cashier', departments: [{ main: 'Front', sub: 'Cashier' }] }]
            });
            const userId = await seedAdmin(company.id);

            const response = await companyTemplateHandler(fakeRequest({ principal: principalFor(userId) }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Cashier');
        });
    });

    describe('POST /api/company/template/coverage-groups/create', () => {
        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const userId = await seedManager(company.id, []);

            const response = await companyTemplateCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ name: 'Cashier', departments: 'Front | Cashier' }).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('adds a default coverage group for an Admin, without affecting an existing Location', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await companyTemplateCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ name: 'Cashier', departments: 'Front | Cashier' }).toString()
            }));

            expect(response.status).toBe(303);
            const company2 = await seedFacade.getCompany(company.id);
            expect(company2.defaultCoverageGroups).toEqual([{ id: 1, name: 'Cashier', departments: [{ main: 'Front', sub: 'Cashier' }] }]);

            const foundLocation = await seedFacade.getLocation(company.id, location.id);
            expect(foundLocation.coverageGroups).toEqual([]);
        });

        it('re-renders the template page with a clear error for an empty name', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);

            const response = await companyTemplateCoverageGroupsCreateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ name: '', departments: 'Front | Cashier' }).toString()
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('Coverage group name is required');
        });
    });

    describe('POST /api/company/template/coverage-groups/update', () => {
        it('403s for a Manager', async () => {
            const company = await seedCompany({ defaultCoverageGroups: [{ id: 1, name: 'Old', departments: [] }] });
            const userId = await seedManager(company.id, []);

            const response = await companyTemplateCoverageGroupsUpdateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: '1', name: 'New', departments: 'A | B' }).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('updates a default coverage group for an Admin', async () => {
            const company = await seedCompany({ defaultCoverageGroups: [{ id: 1, name: 'Old', departments: [] }] });
            const userId = await seedAdmin(company.id);

            const response = await companyTemplateCoverageGroupsUpdateHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: '1', name: 'New', departments: 'A | B' }).toString()
            }));

            expect(response.status).toBe(303);
            const found = await seedFacade.getCompany(company.id);
            expect(found.defaultCoverageGroups).toEqual([{ id: 1, name: 'New', departments: [{ main: 'A', sub: 'B' }] }]);
        });
    });

    describe('POST /api/company/template/coverage-groups/delete', () => {
        it('deletes a default coverage group for an Admin', async () => {
            const company = await seedCompany({ defaultCoverageGroups: [{ id: 1, name: 'Old', departments: [] }] });
            const userId = await seedAdmin(company.id);

            const response = await companyTemplateCoverageGroupsDeleteHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams({ id: '1' }).toString()
            }));

            expect(response.status).toBe(303);
            const found = await seedFacade.getCompany(company.id);
            expect(found.defaultCoverageGroups).toEqual([]);
        });
    });

    describe('POST /api/company/template/hours', () => {
        it('403s for a Manager', async () => {
            const company = await seedCompany();
            const userId = await seedManager(company.id, []);

            const response = await companyTemplateHoursHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams(VALID_HOURS_FORM).toString()
            }));

            expect(response.status).toBe(403);
        });

        it('sets default hours for an Admin, without affecting an existing Location\'s settings', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            const location = await seedLocation(company.id);

            const response = await companyTemplateHoursHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                body: new URLSearchParams(VALID_HOURS_FORM).toString()
            }));

            expect(response.status).toBe(303);
            const found = await seedFacade.getCompany(company.id);
            expect(found.defaultSettings.hoursByDay.monday).toEqual({ start: '09:00', end: '17:00' });

            const foundLocation = await seedFacade.getLocation(company.id, location.id);
            expect(foundLocation.settings.hoursByDay).toEqual({});
        });
    });
});
