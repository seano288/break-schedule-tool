import { randomUUID } from 'node:crypto';
import { ScopeError, assertLocationsBelongToCompany, assertUserBelongsToCompany } from './companyScope.js';

const VALID_ROLES = ['Admin', 'Manager'];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Thrown for expected User-management failures; `reason` lets callers render a specific message. */
export class UserError extends ScopeError {}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string }} params
 */
export async function listUsersForCompany(facade, { companyId }) {
    return facade.listUserLinksByCompany(companyId);
}

/**
 * Lists the Company's non-archived Locations, for rendering the Manager-invite
 * Location checkboxes.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string }} params
 */
export async function listInvitableLocations(facade, { companyId }) {
    const locations = await facade.listLocationsByCompany(companyId);
    return locations.filter(location => !location.archived);
}

/**
 * Generates a single-use invite code scoped to a role. A Manager invite is scoped to
 * the submitted Locations (which must belong to this Company, and can't be empty); an
 * Admin invite is always Company-wide, forcing `locationIds` to `[]` regardless of
 * what the caller submitted.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[] }} params
 */
export async function createInviteForCompany(facade, { companyId, role, locationIds }) {
    assertValidRole(role);
    const scopedLocationIds = await resolveInviteLocationIds(facade, { companyId, role, locationIds });

    const createdAt = new Date();
    return facade.createInviteCode({
        code: randomUUID(),
        companyId,
        role,
        locationIds: scopedLocationIds,
        expiresAt: new Date(createdAt.getTime() + INVITE_TTL_MS).toISOString(),
        createdAt: createdAt.toISOString()
    });
}

async function resolveInviteLocationIds(facade, { companyId, role, locationIds }) {
    if (role === 'Admin') {
        return [];
    }

    const ids = locationIds ?? [];
    if (ids.length === 0) {
        throw new UserError('Select at least one Location for a Manager invite.', 'locations-required');
    }

    await assertLocationsBelongToCompany(facade, companyId, ids);
    return ids;
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, userId: string, role: string }} params
 */
export async function changeUserRole(facade, { companyId, userId, role }) {
    assertValidRole(role);
    await assertUserBelongsToCompany(facade, companyId, userId);
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
    await assertUserBelongsToCompany(facade, companyId, userId);
    await facade.deleteUserLink(userId);
}

function assertValidRole(role) {
    if (!VALID_ROLES.includes(role)) {
        throw new UserError('Role must be Admin or Manager.', 'invalid-role');
    }
}
