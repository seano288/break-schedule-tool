import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import { createCompanyForUser, getLinkStatus, OnboardingError, redeemInviteForUser } from './onboardingService.js';

describe('onboardingService', () => {
    /** @type {TableStorageFacade} */
    let facade;

    beforeAll(async () => {
        facade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await facade.init();
    });

    describe('getLinkStatus', () => {
        it('reports unlinked for an identity with no UserLink', async () => {
            expect(await getLinkStatus(facade, randomUUID())).toEqual({ linked: false });
        });
    });

    describe('createCompanyForUser', () => {
        it('provisions a trial Company with defaults and makes the creator Admin', async () => {
            const userId = randomUUID();

            const result = await createCompanyForUser(facade, { userId, name: 'Acme Outfitters' });

            expect(result.role).toBe('Admin');
            expect(result.company.name).toBe('Acme Outfitters');
            expect(result.company.subscriptionStatus).toBe('trial');
            expect(result.company.defaultCoverageGroups.length).toBeGreaterThan(0);
            expect(result.company.defaultSettings.jurisdiction).toBe('california');

            const status = await getLinkStatus(facade, userId);
            expect(status).toEqual({ linked: true, role: 'Admin', company: result.company });
        });

        it('rejects an empty company name', async () => {
            await expect(createCompanyForUser(facade, { userId: randomUUID(), name: '   ' }))
                .rejects.toMatchObject({ reason: 'invalid-name' });
        });

        it('rejects a request from an already-linked identity', async () => {
            const userId = randomUUID();
            await createCompanyForUser(facade, { userId, name: 'First Co' });

            await expect(createCompanyForUser(facade, { userId, name: 'Second Co' }))
                .rejects.toMatchObject({ reason: 'already-linked' });
        });

        it('lets only one of two racing create-Company requests for the same identity win', async () => {
            const userId = randomUUID();

            const results = await Promise.allSettled([
                createCompanyForUser(facade, { userId, name: 'Race Co A' }),
                createCompanyForUser(facade, { userId, name: 'Race Co B' })
            ]);

            const fulfilled = results.filter(r => r.status === 'fulfilled');
            const rejected = results.filter(r => r.status === 'rejected');
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect(rejected[0].reason).toMatchObject({ reason: 'already-linked' });
        });
    });

    describe('redeemInviteForUser', () => {
        async function seedInvite(overrides = {}) {
            const code = randomUUID();
            const company = await facade.createCompany({
                id: randomUUID(),
                name: 'Invited-to Co',
                subscriptionStatus: 'trial',
                defaultCoverageGroups: [],
                defaultSettings: {},
                createdAt: '2026-07-30T00:00:00.000Z'
            });
            await facade.createInviteCode({
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

        it('attaches the identity with the invite\'s role and Location scope', async () => {
            const code = await seedInvite();
            const userId = randomUUID();

            const result = await redeemInviteForUser(facade, { userId, code });

            expect(result.role).toBe('Manager');
            const status = await getLinkStatus(facade, userId);
            expect(status.linked).toBe(true);
            expect(status.role).toBe('Manager');
            expect(status.company.id).toBe(result.company.id);

            const invite = await facade.getInviteCode(code);
            expect(invite.used).toBe(true);
            expect(invite.usedBy).toBe(userId);
        });

        it('fails clearly for an unknown code', async () => {
            await expect(redeemInviteForUser(facade, { userId: randomUUID(), code: randomUUID() }))
                .rejects.toMatchObject({ reason: 'invalid-code' });
        });

        it('fails clearly for an expired code', async () => {
            const code = await seedInvite({ expiresAt: '2000-01-01T00:00:00.000Z' });

            await expect(redeemInviteForUser(facade, { userId: randomUUID(), code }))
                .rejects.toMatchObject({ reason: 'expired-code' });
        });

        it('fails clearly for an already-used code', async () => {
            const code = await seedInvite();
            await redeemInviteForUser(facade, { userId: randomUUID(), code });

            await expect(redeemInviteForUser(facade, { userId: randomUUID(), code }))
                .rejects.toMatchObject({ reason: 'used-code' });
        });

        it('rejects a request from an already-linked identity', async () => {
            const userId = randomUUID();
            await createCompanyForUser(facade, { userId, name: 'Existing Co' });
            const code = await seedInvite();

            await expect(redeemInviteForUser(facade, { userId, code }))
                .rejects.toMatchObject({ reason: 'already-linked' });
        });
    });

    it('OnboardingError carries a reason alongside its message', () => {
        const err = new OnboardingError('boom', 'invalid-code');
        expect(err.message).toBe('boom');
        expect(err.reason).toBe('invalid-code');
    });
});
