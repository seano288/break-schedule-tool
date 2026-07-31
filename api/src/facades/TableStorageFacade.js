import { TableClient } from '@azure/data-tables';

/**
 * TableStorageFacade — abstracts Azure Table Storage access.
 *
 * Facade pattern (same spirit as the client-side StorageFacade/ExcelFacade):
 * callers get entity-level operations for Company/UserLink/InviteCode, never
 * raw PartitionKey/RowKey/JSON-serialization details.
 *
 * Partitioning: Company is partitioned by its own id (it's always accessed by
 * id). UserLink and InviteCode are partitioned by their lookup key (userId,
 * the literal invite code) rather than by owning Company, since every request
 * resolves "this identity" or "this code" — not "this company's users" — and
 * that resolution must be a point read, not a company-scoped scan.
 */
export class TableStorageFacade {
    /** @param {string} connectionString */
    constructor(connectionString) {
        const options = { allowInsecureConnection: true };
        this._companies = TableClient.fromConnectionString(connectionString, 'companies', options);
        this._userLinks = TableClient.fromConnectionString(connectionString, 'userLinks', options);
        this._inviteCodes = TableClient.fromConnectionString(connectionString, 'inviteCodes', options);
    }

    /** Ensure all backing tables exist. Safe to call repeatedly. */
    async init() {
        await Promise.all(
            [this._companies, this._userLinks, this._inviteCodes].map(createTableIfNotExists)
        );
    }

    // -------------------------------------------------------------------------
    // Companies
    // -------------------------------------------------------------------------

    /**
     * @param {{ id: string, name: string, subscriptionStatus: string, defaultCoverageGroups: Array, defaultSettings: object, createdAt: string }} company
     */
    async createCompany({ id, name, subscriptionStatus, defaultCoverageGroups, defaultSettings, createdAt }) {
        await this._companies.createEntity({
            partitionKey: id,
            rowKey: 'profile',
            name,
            subscriptionStatus,
            defaultCoverageGroups: JSON.stringify(defaultCoverageGroups),
            defaultSettings: JSON.stringify(defaultSettings),
            createdAt
        });
        return { id, name, subscriptionStatus, defaultCoverageGroups, defaultSettings, createdAt };
    }

    /**
     * Looks up a Company by id.
     * @param {string} companyId
     * @returns {Promise<object|null>} null if no Company has that id
     */
    async getCompany(companyId) {
        const entity = await getEntityOrNull(() => this._companies.getEntity(companyId, 'profile'));
        if (!entity) return null;
        return {
            id: entity.partitionKey,
            name: entity.name,
            subscriptionStatus: entity.subscriptionStatus,
            defaultCoverageGroups: JSON.parse(entity.defaultCoverageGroups),
            defaultSettings: JSON.parse(entity.defaultSettings),
            createdAt: entity.createdAt
        };
    }

    // -------------------------------------------------------------------------
    // User links
    // -------------------------------------------------------------------------

    /**
     * @param {{ userId: string, companyId: string, role: string, locationIds: string[], createdAt: string }} link
     * @throws {EntityExistsError} if this identity is already linked to a Company
     */
    async createUserLink({ userId, companyId, role, locationIds, createdAt }) {
        try {
            await this._userLinks.createEntity({
                partitionKey: userId,
                rowKey: 'link',
                companyId,
                role,
                locationIds: JSON.stringify(locationIds),
                createdAt
            });
        } catch (err) {
            if (err.statusCode === 409) {
                throw new EntityExistsError('This identity is already linked to a Company');
            }
            throw err;
        }
        return { userId, companyId, role, locationIds, createdAt };
    }

    /**
     * Looks up the Company an identity is linked to, if any.
     * @param {string} userId
     * @returns {Promise<object|null>} null if this identity has no UserLink yet
     */
    async getUserLink(userId) {
        const entity = await getEntityOrNull(() => this._userLinks.getEntity(userId, 'link'));
        if (!entity) return null;
        return {
            userId: entity.partitionKey,
            companyId: entity.companyId,
            role: entity.role,
            locationIds: JSON.parse(entity.locationIds),
            createdAt: entity.createdAt
        };
    }

    // -------------------------------------------------------------------------
    // Invite codes
    // -------------------------------------------------------------------------

    /**
     * @param {{ code: string, companyId: string, role: string, locationIds: string[], expiresAt: string, createdAt: string }} invite
     */
    async createInviteCode({ code, companyId, role, locationIds, expiresAt, createdAt }) {
        await this._inviteCodes.createEntity({
            partitionKey: 'invite',
            rowKey: code,
            companyId,
            role,
            locationIds: JSON.stringify(locationIds),
            expiresAt,
            used: false,
            createdAt
        });
        return { code, companyId, role, locationIds, expiresAt, used: false, usedBy: null, usedAt: null, createdAt };
    }

    /**
     * Looks up an invite code.
     * @param {string} code
     * @returns {Promise<object|null>} null if no invite has that code
     */
    async getInviteCode(code) {
        const entity = await getEntityOrNull(() => this._inviteCodes.getEntity('invite', code));
        if (!entity) return null;
        return mapInviteEntity(entity);
    }

    /**
     * Marks an invite code as used, guarded by an ETag compare-and-swap so two
     * concurrent redemptions of the same code can't both succeed.
     *
     * @param {string} code
     * @param {{ usedBy: string, usedAt: string }} usage
     * @throws {NotFoundError} if the code doesn't exist
     * @throws {ConflictError} if it was redeemed by a concurrent request first
     */
    async markInviteCodeUsed(code, { usedBy, usedAt }) {
        const entity = await getEntityOrNull(() => this._inviteCodes.getEntity('invite', code));
        if (!entity) {
            throw new NotFoundError('Invite code not found');
        }

        try {
            await this._inviteCodes.updateEntity(
                { partitionKey: 'invite', rowKey: code, used: true, usedBy, usedAt },
                'Merge',
                { etag: entity.etag }
            );
        } catch (err) {
            if (err.statusCode === 412) {
                throw new ConflictError('Invite code was already redeemed');
            }
            throw err;
        }
    }
}

// -------------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------------

export class EntityExistsError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

// -------------------------------------------------------------------------
// Private helpers
// -------------------------------------------------------------------------

async function createTableIfNotExists(client) {
    try {
        await client.createTable();
    } catch (err) {
        if (err.statusCode !== 409) throw err;
    }
}

async function getEntityOrNull(read) {
    try {
        return await read();
    } catch (err) {
        if (err.statusCode === 404) return null;
        throw err;
    }
}

function mapInviteEntity(entity) {
    return {
        code: entity.rowKey,
        companyId: entity.companyId,
        role: entity.role,
        locationIds: JSON.parse(entity.locationIds),
        expiresAt: entity.expiresAt,
        used: entity.used,
        usedBy: entity.usedBy ?? null,
        usedAt: entity.usedAt ?? null,
        createdAt: entity.createdAt
    };
}
