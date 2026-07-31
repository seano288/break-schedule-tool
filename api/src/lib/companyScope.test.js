import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { TableStorageFacade } from '../facades/TableStorageFacade.js';
import { TEST_TABLE_CONNECTION_STRING } from '../../tests/testTableConnection.js';
import {
    ScopeError,
    assertLocationBelongsToCompany,
    assertLocationsBelongToCompany,
    assertUserBelongsToCompany,
    assertViewerAssignedToLocation
} from './companyScope.js';

describe('companyScope', () => {
    /** @type {TableStorageFacade} */
    let facade;

    beforeAll(async () => {
        facade = new TableStorageFacade(TEST_TABLE_CONNECTION_STRING);
        await facade.init();
    });

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

    async function seedUserLink(companyId, overrides = {}) {
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

    describe('assertLocationBelongsToCompany', () => {
        it('returns the Location when it belongs to the given Company', async () => {
            const companyId = randomUUID();
            const location = await seedLocation(companyId);

            await expect(assertLocationBelongsToCompany(facade, companyId, location.id)).resolves.toMatchObject({
                id: location.id
            });
        });

        it('rejects a Location id belonging to a different Company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const location = await seedLocation(companyB);

            await expect(assertLocationBelongsToCompany(facade, companyA, location.id))
                .rejects.toMatchObject({ reason: 'not-found' });
        });

        it('rejects an unknown Location id', async () => {
            await expect(assertLocationBelongsToCompany(facade, randomUUID(), randomUUID()))
                .rejects.toMatchObject({ reason: 'not-found' });
        });
    });

    describe('assertLocationsBelongToCompany', () => {
        it('resolves when every Location belongs to the given Company', async () => {
            const companyId = randomUUID();
            const locationA = await seedLocation(companyId);
            const locationB = await seedLocation(companyId);

            await expect(assertLocationsBelongToCompany(facade, companyId, [locationA.id, locationB.id]))
                .resolves.toEqual(expect.arrayContaining([
                    expect.objectContaining({ id: locationA.id }),
                    expect.objectContaining({ id: locationB.id })
                ]));
        });

        it('resolves to an empty array for an empty id list', async () => {
            await expect(assertLocationsBelongToCompany(facade, randomUUID(), [])).resolves.toEqual([]);
        });

        it('rejects the whole batch if any id belongs to a different Company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const ownLocation = await seedLocation(companyA);
            const foreignLocation = await seedLocation(companyB);

            await expect(assertLocationsBelongToCompany(facade, companyA, [ownLocation.id, foreignLocation.id]))
                .rejects.toMatchObject({ reason: 'not-found' });
        });

        it('rejects the whole batch if any id is unknown', async () => {
            const companyId = randomUUID();
            const ownLocation = await seedLocation(companyId);

            await expect(assertLocationsBelongToCompany(facade, companyId, [ownLocation.id, randomUUID()]))
                .rejects.toMatchObject({ reason: 'not-found' });
        });
    });

    describe('assertViewerAssignedToLocation', () => {
        it('allows an Admin regardless of locationIds', () => {
            expect(() => assertViewerAssignedToLocation({ id: 'loc-x' }, { role: 'Admin', locationIds: [] }))
                .not.toThrow();
        });

        it('allows a Manager assigned to the Location', () => {
            expect(() => assertViewerAssignedToLocation({ id: 'loc-x' }, { role: 'Manager', locationIds: ['loc-x'] }))
                .not.toThrow();
        });

        it('rejects a Manager with no Location assignments', () => {
            expect(() => assertViewerAssignedToLocation({ id: 'loc-x' }, { role: 'Manager', locationIds: [] }))
                .toThrow(expect.objectContaining({ reason: 'forbidden' }));
        });

        it('rejects a Manager scoped to Location X when targeting Location Y', () => {
            expect(() => assertViewerAssignedToLocation({ id: 'loc-y' }, { role: 'Manager', locationIds: ['loc-x'] }))
                .toThrow(expect.objectContaining({ reason: 'forbidden' }));
        });
    });

    describe('assertUserBelongsToCompany', () => {
        it('returns the UserLink when it belongs to the given Company', async () => {
            const companyId = randomUUID();
            const userId = await seedUserLink(companyId);

            await expect(assertUserBelongsToCompany(facade, companyId, userId)).resolves.toMatchObject({ userId });
        });

        it('rejects a User id belonging to a different Company', async () => {
            const companyA = randomUUID();
            const companyB = randomUUID();
            const userId = await seedUserLink(companyB);

            await expect(assertUserBelongsToCompany(facade, companyA, userId))
                .rejects.toMatchObject({ reason: 'not-found' });
        });

        it('rejects an unknown User id', async () => {
            await expect(assertUserBelongsToCompany(facade, randomUUID(), randomUUID()))
                .rejects.toMatchObject({ reason: 'not-found' });
        });
    });

    it('ScopeError carries a reason alongside its message', () => {
        const err = new ScopeError('boom', 'not-found');
        expect(err.message).toBe('boom');
        expect(err.reason).toBe('not-found');
    });
});
