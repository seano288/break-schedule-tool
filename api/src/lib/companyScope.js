/**
 * Multi-tenant isolation primitives shared by every Location/CoverageGroup/Settings/User
 * endpoint. A request never gets to use a Location id, CoverageGroup id, or User id it
 * supplied until that id has been resolved through here against the caller's own Company
 * (and, for Locations, the caller's own assignment within that Company).
 */

/**
 * Thrown when a caller's identity doesn't grant access to a Company-scoped entity: either
 * the id doesn't belong to their Company at all ('not-found'), or it does but a non-Admin
 * caller isn't assigned to it ('forbidden'). Domain error classes (LocationError,
 * SettingsError, UserError) extend this so their existing `instanceof` catch sites also
 * catch isolation failures raised through the shared helpers below.
 */
export class ScopeError extends Error {
    constructor(message, reason) {
        super(message);
        this.reason = reason;
    }
}

/**
 * Resolves a Location by id, scoped to the caller's Company. This is the one place that
 * decides whether a Location id in a request belongs to the caller's Company.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {string} companyId
 * @param {string} locationId
 * @returns {Promise<object>} the Location
 * @throws {ScopeError} 'not-found' if no Location with that id exists under this Company
 */
export async function assertLocationBelongsToCompany(facade, companyId, locationId) {
    const location = await facade.getLocation(companyId, locationId);
    if (!location) {
        throw new ScopeError('Location not found.', 'not-found');
    }
    return location;
}

/**
 * Checks that a non-Admin viewer is assigned to the given Location. Admins are assigned to
 * every Location in their Company implicitly. Call this only after
 * `assertLocationBelongsToCompany` has confirmed the Location belongs to the viewer's Company.
 *
 * @param {object} location the Location, as returned by `assertLocationBelongsToCompany`
 * @param {{ role: string, locationIds?: string[] }} viewer
 * @throws {ScopeError} 'forbidden' if a non-Admin viewer isn't assigned to this Location
 */
export function assertViewerAssignedToLocation(location, { role, locationIds }) {
    if (role !== 'Admin' && !(locationIds ?? []).includes(location.id)) {
        throw new ScopeError('You are not assigned to this Location.', 'forbidden');
    }
}

/**
 * Resolves a User's UserLink by id, scoped to the caller's Company. This is the one place
 * that decides whether a User id in a request belongs to the caller's Company.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {string} companyId
 * @param {string} userId
 * @returns {Promise<object>} the UserLink
 * @throws {ScopeError} 'not-found' if no User with that id exists under this Company
 */
export async function assertUserBelongsToCompany(facade, companyId, userId) {
    const link = await facade.getUserLink(userId);
    if (!link || link.companyId !== companyId) {
        throw new ScopeError('User not found.', 'not-found');
    }
    return link;
}
