import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import {
    changeUserRole,
    createInviteForCompany,
    listInvitableLocations,
    listUsersForCompany,
    revokeCompanyUser,
    UserError
} from './userService.js';

describe('userService', () => {
    /** @type {TableStorageFacade} */
    let facade;

    beforeAll(async () => {
        facade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await facade.init();
    });

    async function seedUser(companyId, overrides = {}) {
        const userId = randomUUID();
        await facade.createUserLink({
            userId,
            companyId,
            role: 'Manager',
            locationIds: [],
            createdAt: '2026-07-30T00:00:00.000Z',
            ...overrides
        });
        return userId;
    }

    async function seedLocation(companyId, overrides = {}) {
        return facade.createLocation({
            id: randomUUID(),
            companyId,
            name: 'Downtown',
            coverageGroups: [],
            settings: {},
            createdAt: '2026-07-30T00:00:00.000Z',
            ...overrides
        });
    }

    describe('listUsersForCompany', () => {
        it('lists only the Users belonging to the given Company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const userA = await seedUser(companyA);
            await seedUser(companyB);

            const users = await listUsersForCompany(facade, { companyId: companyA });

            expect(users.map(u => u.userId)).toEqual([userA]);
        });
    });

    describe('listInvitableLocations', () => {
        it('excludes archived Locations', async () => {
            const companyId = randomUUID();
            const active = await seedLocation(companyId, { name: 'Active' });
            const archived = await seedLocation(companyId, { name: 'Archived' });
            await facade.archiveLocation(companyId, archived.id);

            const locations = await listInvitableLocations(facade, { companyId });

            expect(locations.map(l => l.id)).toEqual([active.id]);
        });
    });

    describe('createInviteForCompany', () => {
        it('creates a Manager invite scoped to the submitted Locations', async () => {
            const companyId = randomUUID();
            const location = await seedLocation(companyId);

            const invite = await createInviteForCompany(facade, {
                companyId, role: 'Manager', locationIds: [location.id]
            });

            expect(invite.companyId).toBe(companyId);
            expect(invite.role).toBe('Manager');
            expect(invite.locationIds).toEqual([location.id]);
            expect(invite.used).toBe(false);
            expect(new Date(invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
        });

        it('forces an empty locationIds for an Admin invite, even if some were submitted', async () => {
            const companyId = randomUUID();
            const location = await seedLocation(companyId);

            const invite = await createInviteForCompany(facade, {
                companyId, role: 'Admin', locationIds: [location.id]
            });

            expect(invite.locationIds).toEqual([]);
        });

        it('rejects a Manager invite with no Locations selected', async () => {
            await expect(createInviteForCompany(facade, { companyId: randomUUID(), role: 'Manager', locationIds: [] }))
                .rejects.toMatchObject({ reason: 'locations-required' });
        });

        it('rejects a Manager invite omitting locationIds entirely', async () => {
            await expect(createInviteForCompany(facade, { companyId: randomUUID(), role: 'Manager' }))
                .rejects.toMatchObject({ reason: 'locations-required' });
        });

        it('rejects a Manager invite naming a Location from a different Company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const foreignLocation = await seedLocation(companyB);

            await expect(createInviteForCompany(facade, {
                companyId: companyA, role: 'Manager', locationIds: [foreignLocation.id]
            })).rejects.toMatchObject({ reason: 'not-found' });
        });

        it('rejects an invalid role', async () => {
            await expect(createInviteForCompany(facade, { companyId: randomUUID(), role: 'Owner' }))
                .rejects.toMatchObject({ reason: 'invalid-role' });
        });
    });

    describe('changeUserRole', () => {
        it('updates the role of a User belonging to the Company', async () => {
            const companyId = randomUUID();
            const userId = await seedUser(companyId, { role: 'Manager' });

            await changeUserRole(facade, { companyId, userId, role: 'Admin' });

            const users = await listUsersForCompany(facade, { companyId });
            expect(users.find(u => u.userId === userId).role).toBe('Admin');
        });

        it('rejects an invalid role', async () => {
            const companyId = randomUUID();
            const userId = await seedUser(companyId);

            await expect(changeUserRole(facade, { companyId, userId, role: 'Owner' }))
                .rejects.toMatchObject({ reason: 'invalid-role' });
        });

        it('rejects a userId that does not belong to this Company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const userId = await seedUser(companyB);

            await expect(changeUserRole(facade, { companyId: companyA, userId, role: 'Admin' }))
                .rejects.toMatchObject({ reason: 'not-found' });
        });
    });

    describe('revokeCompanyUser', () => {
        it('removes the UserLink, so the identity is no longer linked', async () => {
            const companyId = randomUUID();
            const userId = await seedUser(companyId);

            await revokeCompanyUser(facade, { companyId, userId });

            expect(await facade.getUserLink(userId)).toBeNull();
            const users = await listUsersForCompany(facade, { companyId });
            expect(users.some(u => u.userId === userId)).toBe(false);
        });

        it('rejects a userId that does not belong to this Company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const userId = await seedUser(companyB);

            await expect(revokeCompanyUser(facade, { companyId: companyA, userId }))
                .rejects.toMatchObject({ reason: 'not-found' });

            expect(await facade.getUserLink(userId)).not.toBeNull();
        });
    });

    it('UserError carries a reason alongside its message', () => {
        const err = new UserError('boom', 'not-found');
        expect(err.message).toBe('boom');
        expect(err.reason).toBe('not-found');
    });
});
