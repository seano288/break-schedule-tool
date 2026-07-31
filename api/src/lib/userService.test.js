import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import {
    changeUserRole,
    createInviteForCompany,
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

    describe('createInviteForCompany', () => {
        it('creates a Company-wide invite (no Location scoping) for a valid role', async () => {
            const companyId = randomUUID();

            const invite = await createInviteForCompany(facade, { companyId, role: 'Manager' });

            expect(invite.companyId).toBe(companyId);
            expect(invite.role).toBe('Manager');
            expect(invite.locationIds).toEqual([]);
            expect(invite.used).toBe(false);
            expect(new Date(invite.expiresAt).getTime()).toBeGreaterThan(Date.now());
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
