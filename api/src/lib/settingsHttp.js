import { SettingsError, assertLocationEditableByViewer } from './settingsService.js';
import { renderCompanyTemplatePage, renderLocationEditPage } from './settingsView.js';

const STATUS_BY_REASON = {
    'invalid-name': 400,
    'invalid-departments': 400,
    'invalid-hours': 400,
    'not-found': 404,
    forbidden: 403
};

/** Maps a SettingsError to a bare status/body response — used where re-rendering a page would leak data the caller isn't authorized to see. */
export function settingsErrorResponse(err) {
    return { status: STATUS_BY_REASON[err.reason] ?? 400, jsonBody: { error: err.message } };
}

/**
 * Runs a Location coverage-group/hours mutation and maps the shared result shape:
 * a 303 back to that Location's edit page on success, or the edit page re-rendered
 * with a clear error for an expected validation failure. A permission failure
 * (not-found/forbidden) never re-renders the page, since doing so would require
 * fetching data the caller may not be authorized to see.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[], locationId: string }} target
 * @param {() => Promise<void>} action
 */
export async function runLocationSettingsAction(facade, target, action) {
    try {
        await action();
    } catch (err) {
        if (err instanceof SettingsError) {
            if (err.reason === 'not-found' || err.reason === 'forbidden') {
                return settingsErrorResponse(err);
            }
            try {
                const location = await assertLocationEditableByViewer(facade, target);
                return {
                    status: STATUS_BY_REASON[err.reason] ?? 400,
                    headers: { 'content-type': 'text/html' },
                    body: renderLocationEditPage({ location, error: err.message })
                };
            } catch (refetchErr) {
                if (refetchErr instanceof SettingsError) {
                    return settingsErrorResponse(refetchErr);
                }
                throw refetchErr;
            }
        }
        throw err;
    }

    return { status: 303, headers: { location: `/api/locations/edit?id=${encodeURIComponent(target.locationId)}` } };
}

/**
 * Runs a Company default-template mutation and maps the shared result shape:
 * a 303 back to the template page on success, or the template page re-rendered
 * with a clear error on an expected validation failure.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {string} companyId
 * @param {() => Promise<void>} action
 */
export async function runTemplateSettingsAction(facade, companyId, action) {
    try {
        await action();
    } catch (err) {
        if (err instanceof SettingsError) {
            const company = await facade.getCompany(companyId);
            return {
                status: STATUS_BY_REASON[err.reason] ?? 400,
                headers: { 'content-type': 'text/html' },
                body: renderCompanyTemplatePage({ company, error: err.message })
            };
        }
        throw err;
    }

    return { status: 303, headers: { location: '/api/company/template' } };
}
