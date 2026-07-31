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
                createdAt: '2026-07-30T00:00:00.000Z'
            });
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
});
