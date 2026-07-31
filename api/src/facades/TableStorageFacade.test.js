import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import { ConflictError, EntityExistsError, TableStorageFacade } from './TableStorageFacade.js';

describe('TableStorageFacade', () => {
    /** @type {TableStorageFacade} */
    let facade;

    beforeAll(async () => {
        facade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await facade.init();
    });

    describe('companies', () => {
        it('creates and reads back a company, round-tripping JSON fields', async () => {
            const id = randomUUID();
            const created = await facade.createCompany({
                id,
                name: 'Acme Outfitters',
                subscriptionStatus: 'trial',
                defaultCoverageGroups: [{ id: 1, name: 'Cashier', departments: [] }],
                defaultSettings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            expect(created.id).toBe(id);

            const found = await facade.getCompany(id);
            expect(found).toEqual({
                id,
                name: 'Acme Outfitters',
                subscriptionStatus: 'trial',
                defaultCoverageGroups: [{ id: 1, name: 'Cashier', departments: [] }],
                defaultSettings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });
        });

        it('returns null for an unknown company', async () => {
            expect(await facade.getCompany(randomUUID())).toBeNull();
        });
    });

    describe('userLinks', () => {
        it('creates and reads back a user link', async () => {
            const userId = randomUUID();
            const companyId = randomUUID();

            await facade.createUserLink({
                userId,
                companyId,
                role: 'Admin',
                locationIds: [],
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            expect(await facade.getUserLink(userId)).toEqual({
                userId,
                companyId,
                role: 'Admin',
                locationIds: [],
                userDetails: null,
                createdAt: '2026-07-30T00:00:00.000Z'
            });
        });

        it('stores an optional userDetails label', async () => {
            const userId = randomUUID();

            await facade.createUserLink({
                userId,
                companyId: randomUUID(),
                role: 'Admin',
                locationIds: [],
                userDetails: 'alice@example.com',
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            expect((await facade.getUserLink(userId)).userDetails).toBe('alice@example.com');
        });

        it('returns null for an identity with no link', async () => {
            expect(await facade.getUserLink(randomUUID())).toBeNull();
        });

        it('rejects a second link for the same identity', async () => {
            const userId = randomUUID();
            const link = {
                userId,
                companyId: randomUUID(),
                role: 'Manager',
                locationIds: ['loc-1'],
                createdAt: '2026-07-30T00:00:00.000Z'
            };

            await facade.createUserLink(link);

            await expect(facade.createUserLink({ ...link, companyId: randomUUID() }))
                .rejects.toThrow(EntityExistsError);
        });

        it('lists only the user links belonging to the given company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const userA = randomUUID();
            await facade.createUserLink({
                userId: userA,
                companyId: companyA,
                role: 'Admin',
                locationIds: [],
                createdAt: '2026-07-30T00:00:00.000Z'
            });
            await facade.createUserLink({
                userId: randomUUID(),
                companyId: companyB,
                role: 'Admin',
                locationIds: [],
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            const links = await facade.listUserLinksByCompany(companyA);

            expect(links.map(l => l.userId)).toEqual([userA]);
        });

        it('updates a user link\'s role and Location scope together', async () => {
            const userId = randomUUID();
            await facade.createUserLink({
                userId,
                companyId: randomUUID(),
                role: 'Manager',
                locationIds: ['loc-old'],
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            await facade.updateUserLinkRoleAndLocations(userId, { role: 'Admin', locationIds: [] });

            const link = await facade.getUserLink(userId);
            expect(link.role).toBe('Admin');
            expect(link.locationIds).toEqual([]);
        });

        it('deletes a user link, so a later lookup returns null', async () => {
            const userId = randomUUID();
            const companyId = randomUUID();
            await facade.createUserLink({
                userId,
                companyId,
                role: 'Admin',
                locationIds: [],
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            await facade.deleteUserLink(userId);

            expect(await facade.getUserLink(userId)).toBeNull();
            expect(await facade.listUserLinksByCompany(companyId)).toEqual([]);
        });
    });

    describe('inviteCodes', () => {
        it('creates and reads back an invite code, unused by default', async () => {
            const code = randomUUID();
            const companyId = randomUUID();

            await facade.createInviteCode({
                code,
                companyId,
                role: 'Manager',
                locationIds: ['loc-1', 'loc-2'],
                expiresAt: '2099-01-01T00:00:00.000Z',
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            expect(await facade.getInviteCode(code)).toEqual({
                code,
                companyId,
                role: 'Manager',
                locationIds: ['loc-1', 'loc-2'],
                expiresAt: '2099-01-01T00:00:00.000Z',
                used: false,
                usedBy: null,
                usedAt: null,
                createdAt: '2026-07-30T00:00:00.000Z'
            });
        });

        it('returns null for an unknown invite code', async () => {
            expect(await facade.getInviteCode(randomUUID())).toBeNull();
        });

        it('marks an invite code used', async () => {
            const code = randomUUID();
            await facade.createInviteCode({
                code,
                companyId: randomUUID(),
                role: 'Manager',
                locationIds: [],
                expiresAt: '2099-01-01T00:00:00.000Z',
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            await facade.markInviteCodeUsed(code, { usedBy: 'user-1', usedAt: '2026-07-30T01:00:00.000Z' });

            const found = await facade.getInviteCode(code);
            expect(found.used).toBe(true);
            expect(found.usedBy).toBe('user-1');
            expect(found.usedAt).toBe('2026-07-30T01:00:00.000Z');
        });

        it('lets only one of two racing redemptions win', async () => {
            const code = randomUUID();
            await facade.createInviteCode({
                code,
                companyId: randomUUID(),
                role: 'Manager',
                locationIds: [],
                expiresAt: '2099-01-01T00:00:00.000Z',
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            const results = await Promise.allSettled([
                facade.markInviteCodeUsed(code, { usedBy: 'user-a', usedAt: '2026-07-30T01:00:00.000Z' }),
                facade.markInviteCodeUsed(code, { usedBy: 'user-b', usedAt: '2026-07-30T01:00:00.000Z' })
            ]);

            const fulfilled = results.filter(r => r.status === 'fulfilled');
            const rejected = results.filter(r => r.status === 'rejected');
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect(rejected[0].reason).toBeInstanceOf(ConflictError);
        });
    });

    describe('locations', () => {
        it('creates and reads back a location, round-tripping JSON fields', async () => {
            const companyId = randomUUID();
            const id = randomUUID();

            const created = await facade.createLocation({
                id,
                companyId,
                name: 'Downtown',
                coverageGroups: [{ id: 1, name: 'Cashier', departments: [] }],
                settings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            expect(created).toEqual({
                id,
                companyId,
                name: 'Downtown',
                archived: false,
                coverageGroups: [{ id: 1, name: 'Cashier', departments: [] }],
                settings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            expect(await facade.getLocation(companyId, id)).toEqual(created);
        });

        it('returns null for an unknown location', async () => {
            expect(await facade.getLocation(randomUUID(), randomUUID())).toBeNull();
        });

        it('returns null when the location id belongs to a different company', async () => {
            const companyId = randomUUID();
            const id = randomUUID();
            await facade.createLocation({
                id,
                companyId,
                name: 'Downtown',
                coverageGroups: [],
                settings: {},
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            expect(await facade.getLocation(randomUUID(), id)).toBeNull();
        });

        it('lists only the locations belonging to the given company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const locationA = await facade.createLocation({
                id: randomUUID(),
                companyId: companyA,
                name: 'A Store',
                coverageGroups: [],
                settings: {},
                createdAt: '2026-07-30T00:00:00.000Z'
            });
            await facade.createLocation({
                id: randomUUID(),
                companyId: companyB,
                name: 'B Store',
                coverageGroups: [],
                settings: {},
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            const locations = await facade.listLocationsByCompany(companyA);
            expect(locations).toEqual([locationA]);
        });

        it('renames a location', async () => {
            const companyId = randomUUID();
            const id = randomUUID();
            await facade.createLocation({
                id,
                companyId,
                name: 'Old Name',
                coverageGroups: [],
                settings: {},
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            await facade.renameLocation(companyId, id, 'New Name');

            const found = await facade.getLocation(companyId, id);
            expect(found.name).toBe('New Name');
        });

        it('archives a location', async () => {
            const companyId = randomUUID();
            const id = randomUUID();
            await facade.createLocation({
                id,
                companyId,
                name: 'Downtown',
                coverageGroups: [],
                settings: {},
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            await facade.archiveLocation(companyId, id);

            const found = await facade.getLocation(companyId, id);
            expect(found.archived).toBe(true);
        });

        it('updates a location\'s coverage groups, leaving its settings untouched', async () => {
            const companyId = randomUUID();
            const id = randomUUID();
            await facade.createLocation({
                id,
                companyId,
                name: 'Downtown',
                coverageGroups: [],
                settings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            const newGroups = [{ id: 1, name: 'Cashier', departments: [{ main: 'Front', sub: 'Cashier' }] }];
            await facade.updateLocationCoverageGroups(companyId, id, newGroups);

            const found = await facade.getLocation(companyId, id);
            expect(found.coverageGroups).toEqual(newGroups);
            expect(found.settings).toEqual({ hoursByDay: {}, advanced: {} });
        });

        it('updates a location\'s settings, leaving its coverage groups untouched', async () => {
            const companyId = randomUUID();
            const id = randomUUID();
            const groups = [{ id: 1, name: 'Cashier', departments: [] }];
            await facade.createLocation({
                id,
                companyId,
                name: 'Downtown',
                coverageGroups: groups,
                settings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            const newSettings = { hoursByDay: { monday: { start: '09:00', end: '17:00' } }, advanced: {} };
            await facade.updateLocationSettings(companyId, id, newSettings);

            const found = await facade.getLocation(companyId, id);
            expect(found.settings).toEqual(newSettings);
            expect(found.coverageGroups).toEqual(groups);
        });

        it('updating one location never affects another', async () => {
            const companyId = randomUUID();
            const locationA = await facade.createLocation({
                id: randomUUID(),
                companyId,
                name: 'A Store',
                coverageGroups: [{ id: 1, name: 'Original', departments: [] }],
                settings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });
            const locationB = await facade.createLocation({
                id: randomUUID(),
                companyId,
                name: 'B Store',
                coverageGroups: [{ id: 1, name: 'Original', departments: [] }],
                settings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            await facade.updateLocationCoverageGroups(companyId, locationA.id, [{ id: 1, name: 'Changed', departments: [] }]);

            const foundB = await facade.getLocation(companyId, locationB.id);
            expect(foundB.coverageGroups).toEqual([{ id: 1, name: 'Original', departments: [] }]);
        });
    });

    describe('company default template', () => {
        it('updates the default coverage groups, leaving default settings untouched', async () => {
            const id = randomUUID();
            await facade.createCompany({
                id,
                name: 'Acme Outfitters',
                subscriptionStatus: 'trial',
                defaultCoverageGroups: [],
                defaultSettings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            const newGroups = [{ id: 1, name: 'Cashier', departments: [] }];
            await facade.updateCompanyDefaultCoverageGroups(id, newGroups);

            const found = await facade.getCompany(id);
            expect(found.defaultCoverageGroups).toEqual(newGroups);
            expect(found.defaultSettings).toEqual({ hoursByDay: {}, advanced: {} });
        });

        it('updates the default settings, leaving default coverage groups untouched', async () => {
            const id = randomUUID();
            const groups = [{ id: 1, name: 'Cashier', departments: [] }];
            await facade.createCompany({
                id,
                name: 'Acme Outfitters',
                subscriptionStatus: 'trial',
                defaultCoverageGroups: groups,
                defaultSettings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            const newSettings = { hoursByDay: { monday: { start: '09:00', end: '17:00' } }, advanced: {} };
            await facade.updateCompanyDefaultSettings(id, newSettings);

            const found = await facade.getCompany(id);
            expect(found.defaultSettings).toEqual(newSettings);
            expect(found.defaultCoverageGroups).toEqual(groups);
        });

        it('does not affect an existing Location when the Company template changes later', async () => {
            const companyId = randomUUID();
            await facade.createCompany({
                id: companyId,
                name: 'Acme Outfitters',
                subscriptionStatus: 'trial',
                defaultCoverageGroups: [{ id: 1, name: 'Original', departments: [] }],
                defaultSettings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });
            const location = await facade.createLocation({
                id: randomUUID(),
                companyId,
                name: 'Downtown',
                coverageGroups: [{ id: 1, name: 'Original', departments: [] }],
                settings: { hoursByDay: {}, advanced: {} },
                createdAt: '2026-07-30T00:00:00.000Z'
            });

            await facade.updateCompanyDefaultCoverageGroups(companyId, [{ id: 1, name: 'Changed', departments: [] }]);

            const found = await facade.getLocation(companyId, location.id);
            expect(found.coverageGroups).toEqual([{ id: 1, name: 'Original', departments: [] }]);
        });
    });
});
