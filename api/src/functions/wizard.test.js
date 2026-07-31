import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import { fakeRequest } from '../../tests/fakeRequest.js';
import { wizardSelectHandler } from './wizardSelect.js';
import { wizardUploadHandler } from './wizardUpload.js';
import { wizardReviewHandler } from './wizardReview.js';

// These handlers resolve TABLE_STORAGE_CONNECTION_STRING via getFacade() — set in
// vitest.config.js to point at the same test Azurite instance as this seeding facade.

const VALID_SCHEDULE_ROWS = [
    ['Date: 2024-01-15'],
    ['Location: Test Store'],
    ['Dept', 'Job', 'Name'],
    [], [], [],
    ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'],
    ['Cashier', null, null, null],
    [null, 'Cashier', 'Smith, Alice', '8:00AM-4:30PM'],
    ['Clothing', null, null, null],
    [null, 'Clothing', 'Wilson, Dave', '10:00AM-2:00PM']
];

function scheduleFile(rows = VALID_SCHEDULE_ROWS, name = 'schedule.xlsx') {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Schedule');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return new File([buffer], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function formDataWith(fields) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) form.append(key, value);
    }
    return form;
}

describe('wizard endpoints', () => {
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

    describe('GET /api/wizard', () => {
        it('401s when unauthenticated', async () => {
            const response = await wizardSelectHandler(fakeRequest());
            expect(response.status).toBe(401);
        });

        it('redirects to onboarding for an identity with no Company link', async () => {
            const response = await wizardSelectHandler(fakeRequest({ principal: principalFor(randomUUID()) }));
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/onboarding');
        });

        it('shows a Manager only their assigned, active Locations', async () => {
            const company = await seedCompany();
            const assigned = await seedLocation(company.id, { name: 'Mine' });
            await seedLocation(company.id, { name: 'Not Mine' });
            const userId = await seedManager(company.id, [assigned.id]);

            const response = await wizardSelectHandler(fakeRequest({ principal: principalFor(userId) }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Mine');
            expect(response.body).not.toContain('Not Mine');
        });

        it('excludes archived Locations even for an Admin', async () => {
            const company = await seedCompany();
            const userId = await seedAdmin(company.id);
            await seedLocation(company.id, { name: 'Active Store' });
            const archived = await seedLocation(company.id, { name: 'Archived Store' });
            await seedFacade.archiveLocation(company.id, archived.id);

            const response = await wizardSelectHandler(fakeRequest({ principal: principalFor(userId) }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Active Store');
            expect(response.body).not.toContain('Archived Store');
        });
    });

    describe('GET /api/wizard/upload', () => {
        it('401s when unauthenticated', async () => {
            const response = await wizardUploadHandler(fakeRequest({ query: { locationId: 'x' } }));
            expect(response.status).toBe(401);
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id);

            const response = await wizardUploadHandler(fakeRequest({
                principal: principalFor(userId), query: { locationId: foreignLocation.id }
            }));

            expect(response.status).toBe(404);
        });

        it('403s for a Manager not assigned to the Location', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedManager(company.id, []);

            const response = await wizardUploadHandler(fakeRequest({
                principal: principalFor(userId), query: { locationId: location.id }
            }));

            expect(response.status).toBe(403);
        });

        it('shows the upload form for a Manager assigned to the Location', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id, { name: 'Downtown Store' });
            const userId = await seedManager(company.id, [location.id]);

            const response = await wizardUploadHandler(fakeRequest({
                principal: principalFor(userId), query: { locationId: location.id }
            }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Downtown Store');
            expect(response.body).toContain('enctype="multipart/form-data"');
        });
    });

    describe('POST /api/wizard/review', () => {
        it('401s when unauthenticated', async () => {
            const response = await wizardReviewHandler(fakeRequest({ method: 'POST', formData: formDataWith({ locationId: 'x' }) }));
            expect(response.status).toBe(401);
        });

        it('redirects to onboarding for an identity with no Company link', async () => {
            const response = await wizardReviewHandler(fakeRequest({
                method: 'POST', principal: principalFor(randomUUID()), formData: formDataWith({ locationId: 'x' })
            }));
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe('/api/onboarding');
        });

        it('403s for a Manager scoped to a different Location in the same Company', async () => {
            const company = await seedCompany();
            const locationX = await seedLocation(company.id, { name: 'X' });
            const locationY = await seedLocation(company.id, { name: 'Y' });
            const userId = await seedManager(company.id, [locationX.id]);

            const response = await wizardReviewHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                formData: formDataWith({ locationId: locationY.id, file: scheduleFile() })
            }));

            expect(response.status).toBe(403);
        });

        it('404s for a Location id belonging to a different Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const userId = await seedAdmin(companyA.id);
            const foreignLocation = await seedLocation(companyB.id);

            const response = await wizardReviewHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                formData: formDataWith({ locationId: foreignLocation.id, file: scheduleFile() })
            }));

            expect(response.status).toBe(404);
        });

        it('re-renders the upload form with a clear error when no file is uploaded', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedAdmin(company.id);

            const response = await wizardReviewHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                formData: formDataWith({ locationId: location.id })
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('choose a file');
        });

        it('re-renders the upload form with a clear error for a structurally invalid file', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id);
            const userId = await seedAdmin(company.id);
            const badRows = Array.from({ length: 8 }, (_, i) => ['not', 'a', 'schedule', `row ${i}`]);

            const response = await wizardReviewHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                formData: formDataWith({ locationId: location.id, file: scheduleFile(badRows) })
            }));

            expect(response.status).toBe(400);
            expect(response.body).toContain('UKG schedule export');
        });

        it('renders a review screen with parsed departments, employees, and shifts for a valid file', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id, { name: 'Downtown Store' });
            const userId = await seedManager(company.id, [location.id]);

            const response = await wizardReviewHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                formData: formDataWith({ locationId: location.id, file: scheduleFile() })
            }));

            expect(response.status).toBe(200);
            expect(response.body).toContain('Downtown Store');
            expect(response.body).toContain('Cashier');
            expect(response.body).toContain('Alice Smith');
            expect(response.body).toContain('8:00AM-4:30PM');
            expect(response.body).toContain('Clothing');
            expect(response.body).toContain('Dave Wilson');
        });

        it('carries the Location id and parsed schedule forward via hidden form fields', async () => {
            const company = await seedCompany();
            const location = await seedLocation(company.id, { name: 'Downtown Store' });
            const userId = await seedAdmin(company.id);

            const response = await wizardReviewHandler(fakeRequest({
                method: 'POST',
                principal: principalFor(userId),
                formData: formDataWith({ locationId: location.id, file: scheduleFile() })
            }));

            expect(response.status).toBe(200);
            expect(response.body).toContain(`name="locationId" value="${location.id}"`);
            expect(response.body).toContain('name="scheduleData"');
            expect(response.body).toContain('Alice Smith');
            // The scheduleData hidden field is HTML-escaped JSON containing the parsed rows.
            expect(response.body).toMatch(/name="scheduleData" value="[^"]*Cashier[^"]*"/);
        });
    });
});
