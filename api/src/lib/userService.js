import { randomUUID } from 'node:crypto';

const VALID_ROLES = ['Admin', 'Manager'];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Thrown for expected User-management failures; `reason` lets callers render a specific message. */
export class UserError extends Error {
    constructor(message, reason) {
        super(message);
        this.reason = reason;
    }
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string }} params
 */
export async function listUsersForCompany(facade, { companyId }) {
    return facade.listUserLinksByCompany(companyId);
}

/**
 * Generates a single-use invite code scoped to a role, Company-wide (no Location
 * scoping — deferred per issue #7).
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string }} params
 */
export async function createInviteForCompany(facade, { companyId, role }) {
    assertValidRole(role);

    const createdAt = new Date();
    return facade.createInviteCode({
        code: randomUUID(),
        companyId,
        role,
        locationIds: [],
        expiresAt: new Date(createdAt.getTime() + INVITE_TTL_MS).toISOString(),
        createdAt: createdAt.toISOString()
    });
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, userId: string, role: string }} params
 */
export async function changeUserRole(facade, { companyId, userId, role }) {
    assertValidRole(role);
    await assertCompanyMember(facade, companyId, userId);
    await facade.updateUserLinkRole(userId, role);
}

/**
 * Revokes a User's access to the Company, immediately preventing further use of the
 * app under that identity — the next request under it finds no UserLink and is routed
 * back to the create-or-join screen.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, userId: string }} params
 */
export async function revokeCompanyUser(facade, { companyId, userId }) {
    await assertCompanyMember(facade, companyId, userId);
    await facade.deleteUserLink(userId);
}

function assertValidRole(role) {
    if (!VALID_ROLES.includes(role)) {
        throw new UserError('Role must be Admin or Manager.', 'invalid-role');
    }
}

async function assertCompanyMember(facade, companyId, userId) {
    const link = await facade.getUserLink(userId);
    if (!link || link.companyId !== companyId) {
        throw new UserError('User not found.', 'not-found');
    }
}
