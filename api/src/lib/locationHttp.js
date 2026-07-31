import { listLocationsForViewer } from './locationService.js';
import { ScopeError } from './companyScope.js';
import { renderLocationsPage } from './locationView.js';

const STATUS_BY_REASON = {
    'invalid-name': 400,
    'not-found': 404
};

/**
 * Runs a Location mutation (create/rename/archive) and maps the shared result
 * shape: a 303 to the Locations list on success, or the Locations page
 * re-rendered with a clear error on an expected failure.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[] }} link
 * @param {() => Promise<void>} action
 */
export async function runLocationAction(facade, link, action) {
    try {
        await action();
    } catch (err) {
        if (err instanceof ScopeError) {
            const locations = await listLocationsForViewer(facade, link);
            return {
                status: STATUS_BY_REASON[err.reason] ?? 400,
                headers: { 'content-type': 'text/html' },
                body: renderLocationsPage({ role: link.role, locations, error: err.message })
            };
        }
        throw err;
    }

    return { status: 303, headers: { location: '/api/locations' } };
}
