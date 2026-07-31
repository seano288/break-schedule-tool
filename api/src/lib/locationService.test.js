import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import {
    archiveCompanyLocation,
    createLocationForCompany,
    listLocationsForViewer,
    LocationError,
    renameCompanyLocation
} from './locationService.js';

describe('locationService', () => {
    /** @type {TableStorageFacade} */
    let facade;

    beforeAll(async () => {
        facade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await facade.init();
    });

    async function seedCompany(overrides = {}) {
        return facade.createCompany({
            id: randomUUID(),
            name: 'Acme Outfitters',
            subscriptionStatus: 'trial',
            defaultCoverageGroups: [{ id: 1, name: 'Cashier', departments: [] }],
            defaultSettings: { jurisdiction: 'california', hoursByDay: {}, advanced: {} },
            createdAt: '2026-07-30T00:00:00.000Z',
            ...overrides
        });
    }

    describe('createLocationForCompany', () => {
        it('seeds the new Location from the Company\'s default template', async () => {
            const company = await seedCompany();

            const location = await createLocationForCompany(facade, { companyId: company.id, name: 'Downtown' });

            expect(location.name).toBe('Downtown');
            expect(location.companyId).toBe(company.id);
            expect(location.archived).toBe(false);
            expect(location.coverageGroups).toEqual(company.defaultCoverageGroups);
            expect(location.settings).toEqual(company.defaultSettings);
        });

        it('rejects an empty name', async () => {
            const company = await seedCompany();

            await expect(createLocationForCompany(facade, { companyId: company.id, name: '   ' }))
                .rejects.toMatchObject({ reason: 'invalid-name' });
        });
    });

    describe('renameCompanyLocation', () => {
        it('renames a Location belonging to the given Company', async () => {
            const company = await seedCompany();
            const location = await createLocationForCompany(facade, { companyId: company.id, name: 'Old Name' });

            await renameCompanyLocation(facade, { companyId: company.id, locationId: location.id, name: 'New Name' });

            const locations = await listLocationsForViewer(facade, { companyId: company.id, role: 'Admin' });
            expect(locations.find(l => l.id === location.id).name).toBe('New Name');
        });

        it('rejects an empty name', async () => {
            const company = await seedCompany();
            const location = await createLocationForCompany(facade, { companyId: company.id, name: 'Downtown' });

            await expect(renameCompanyLocation(facade, { companyId: company.id, locationId: location.id, name: '' }))
                .rejects.toMatchObject({ reason: 'invalid-name' });
        });

        it('rejects a Location id that does not belong to this Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const location = await createLocationForCompany(facade, { companyId: companyB.id, name: 'Downtown' });

            await expect(renameCompanyLocation(facade, { companyId: companyA.id, locationId: location.id, name: 'Hijacked' }))
                .rejects.toMatchObject({ reason: 'not-found' });
        });
    });

    describe('archiveCompanyLocation', () => {
        it('marks a Location archived', async () => {
            const company = await seedCompany();
            const location = await createLocationForCompany(facade, { companyId: company.id, name: 'Downtown' });

            await archiveCompanyLocation(facade, { companyId: company.id, locationId: location.id });

            const locations = await listLocationsForViewer(facade, { companyId: company.id, role: 'Admin' });
            expect(locations.find(l => l.id === location.id).archived).toBe(true);
        });

        it('rejects a Location id that does not belong to this Company', async () => {
            const companyA = await seedCompany();
            const companyB = await seedCompany();
            const location = await createLocationForCompany(facade, { companyId: companyB.id, name: 'Downtown' });

            await expect(archiveCompanyLocation(facade, { companyId: companyA.id, locationId: location.id }))
                .rejects.toMatchObject({ reason: 'not-found' });
        });
    });

    describe('listLocationsForViewer', () => {
        it('shows an Admin every Location under their Company, including archived ones', async () => {
            const company = await seedCompany();
            const active = await createLocationForCompany(facade, { companyId: company.id, name: 'Active Store' });
            const archived = await createLocationForCompany(facade, { companyId: company.id, name: 'Archived Store' });
            await archiveCompanyLocation(facade, { companyId: company.id, locationId: archived.id });

            const locations = await listLocationsForViewer(facade, { companyId: company.id, role: 'Admin' });

            expect(locations.map(l => l.id).sort()).toEqual([active.id, archived.id].sort());
        });

        it('shows a Manager only the Locations they are assigned to', async () => {
            const company = await seedCompany();
            const assigned = await createLocationForCompany(facade, { companyId: company.id, name: 'Mine' });
            const unassigned = await createLocationForCompany(facade, { companyId: company.id, name: 'Not Mine' });

            const locations = await listLocationsForViewer(facade, {
                companyId: company.id,
                role: 'Manager',
                locationIds: [assigned.id]
            });

            expect(locations.map(l => l.id)).toEqual([assigned.id]);
            expect(locations.some(l => l.id === unassigned.id)).toBe(false);
        });

        it('excludes archived Locations from a Manager\'s list even if they are assigned', async () => {
            const company = await seedCompany();
            const location = await createLocationForCompany(facade, { companyId: company.id, name: 'Downtown' });
            await archiveCompanyLocation(facade, { companyId: company.id, locationId: location.id });

            const locations = await listLocationsForViewer(facade, {
                companyId: company.id,
                role: 'Manager',
                locationIds: [location.id]
            });

            expect(locations).toEqual([]);
        });
    });

    it('LocationError carries a reason alongside its message', () => {
        const err = new LocationError('boom', 'not-found');
        expect(err.message).toBe('boom');
        expect(err.reason).toBe('not-found');
    });
});
