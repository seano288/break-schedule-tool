import { randomUUID } from 'node:crypto';
import { ScopeError, assertLocationBelongsToCompany } from './companyScope.js';

/** Thrown for expected Location-management failures; `reason` lets callers render a specific message. */
export class LocationError extends ScopeError {}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[] }} viewer
 * @returns {Promise<object[]>}
 */
export async function listLocationsForViewer(facade, { companyId, role, locationIds }) {
    const locations = await facade.listLocationsByCompany(companyId);
    if (role === 'Admin') {
        return locations;
    }

    const allowed = new Set(locationIds ?? []);
    return locations.filter(location => allowed.has(location.id) && !location.archived);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, name: string }} params
 */
export async function createLocationForCompany(facade, { companyId, name }) {
    const trimmedName = requireName(name);

    const company = await facade.getCompany(companyId);
    return facade.createLocation({
        id: randomUUID(),
        companyId,
        name: trimmedName,
        coverageGroups: company.defaultCoverageGroups,
        settings: company.defaultSettings,
        createdAt: new Date().toISOString()
    });
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, locationId: string, name: string }} params
 */
export async function renameCompanyLocation(facade, { companyId, locationId, name }) {
    const trimmedName = requireName(name);
    await assertLocationBelongsToCompany(facade, companyId, locationId);
    await facade.renameLocation(companyId, locationId, trimmedName);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, locationId: string }} params
 */
export async function archiveCompanyLocation(facade, { companyId, locationId }) {
    await assertLocationBelongsToCompany(facade, companyId, locationId);
    await facade.archiveLocation(companyId, locationId);
}

function requireName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
        throw new LocationError('Location name is required.', 'invalid-name');
    }
    return trimmed;
}
