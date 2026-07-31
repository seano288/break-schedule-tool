import { assertLocationBelongsToCompany, assertViewerAssignedToLocation, ScopeError } from './companyScope.js';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Thrown for expected coverage-group/hours editing failures; `reason` lets callers render a specific message. */
export class SettingsError extends ScopeError {}

// -------------------------------------------------------------------------
// Location-scoped (Manager/Admin assigned to that Location)
// -------------------------------------------------------------------------

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[], locationId: string }} target
 * @returns {Promise<object>} the Location
 * @throws {ScopeError} 'not-found' or 'forbidden'
 */
export async function assertLocationEditableByViewer(facade, { companyId, role, locationIds, locationId }) {
    const location = await assertLocationBelongsToCompany(facade, companyId, locationId);
    assertViewerAssignedToLocation(location, { role, locationIds });
    return location;
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[], locationId: string, name: string, departments: string }} params `departments` is newline-delimited "Main | Sub" text
 */
export async function addLocationCoverageGroup(facade, { companyId, role, locationIds, locationId, name, departments }) {
    const location = await assertLocationEditableByViewer(facade, { companyId, role, locationIds, locationId });
    const group = buildCoverageGroup(nextGroupId(location.coverageGroups), { name, departments });
    await facade.updateLocationCoverageGroups(companyId, locationId, [...location.coverageGroups, group]);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[], locationId: string, id: string, name: string, departments: string }} params
 */
export async function updateLocationCoverageGroup(facade, { companyId, role, locationIds, locationId, id, name, departments }) {
    const location = await assertLocationEditableByViewer(facade, { companyId, role, locationIds, locationId });
    const groups = replaceCoverageGroup(location.coverageGroups, { id, name, departments });
    await facade.updateLocationCoverageGroups(companyId, locationId, groups);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[], locationId: string, id: string }} params
 */
export async function deleteLocationCoverageGroup(facade, { companyId, role, locationIds, locationId, id }) {
    const location = await assertLocationEditableByViewer(facade, { companyId, role, locationIds, locationId });
    const groups = removeCoverageGroup(location.coverageGroups, id);
    await facade.updateLocationCoverageGroups(companyId, locationId, groups);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, role: string, locationIds?: string[], locationId: string }} target
 * @param {URLSearchParams} form `<day>_start`/`<day>_end` fields for each of the 7 days
 */
export async function setLocationHours(facade, { companyId, role, locationIds, locationId }, form) {
    const location = await assertLocationEditableByViewer(facade, { companyId, role, locationIds, locationId });
    const hoursByDay = parseHoursForm(form);
    await facade.updateLocationSettings(companyId, locationId, { ...location.settings, hoursByDay });
}

// -------------------------------------------------------------------------
// Company default template (Admin only — role is checked at the HTTP layer,
// same as createLocationForCompany's Admin-only guard)
// -------------------------------------------------------------------------

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, name: string, departments: string }} params
 */
export async function addTemplateCoverageGroup(facade, { companyId, name, departments }) {
    const company = await facade.getCompany(companyId);
    const group = buildCoverageGroup(nextGroupId(company.defaultCoverageGroups), { name, departments });
    await facade.updateCompanyDefaultCoverageGroups(companyId, [...company.defaultCoverageGroups, group]);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, id: string, name: string, departments: string }} params
 */
export async function updateTemplateCoverageGroup(facade, { companyId, id, name, departments }) {
    const company = await facade.getCompany(companyId);
    const groups = replaceCoverageGroup(company.defaultCoverageGroups, { id, name, departments });
    await facade.updateCompanyDefaultCoverageGroups(companyId, groups);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string, id: string }} params
 */
export async function deleteTemplateCoverageGroup(facade, { companyId, id }) {
    const company = await facade.getCompany(companyId);
    const groups = removeCoverageGroup(company.defaultCoverageGroups, id);
    await facade.updateCompanyDefaultCoverageGroups(companyId, groups);
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string }} target
 * @param {URLSearchParams} form
 */
export async function setTemplateHours(facade, { companyId }, form) {
    const company = await facade.getCompany(companyId);
    const hoursByDay = parseHoursForm(form);
    await facade.updateCompanyDefaultSettings(companyId, { ...company.defaultSettings, hoursByDay });
}

// -------------------------------------------------------------------------
// Private: coverage-group array helpers, shared by both scopes above
// -------------------------------------------------------------------------

function nextGroupId(groups) {
    return groups.length > 0 ? Math.max(...groups.map(g => g.id)) + 1 : 1;
}

function buildCoverageGroup(id, { name, departments }) {
    return { id, name: requireGroupName(name), departments: parseDepartments(departments) };
}

function replaceCoverageGroup(groups, { id, name, departments }) {
    const groupId = Number(id);
    const index = groups.findIndex(g => g.id === groupId);
    if (index === -1) {
        throw new SettingsError('Coverage group not found.', 'not-found');
    }
    const updated = [...groups];
    updated[index] = { id: groupId, name: requireGroupName(name), departments: parseDepartments(departments) };
    return updated;
}

function removeCoverageGroup(groups, id) {
    const groupId = Number(id);
    const filtered = groups.filter(g => g.id !== groupId);
    if (filtered.length === groups.length) {
        throw new SettingsError('Coverage group not found.', 'not-found');
    }
    return filtered;
}

function requireGroupName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
        throw new SettingsError('Coverage group name is required.', 'invalid-name');
    }
    return trimmed;
}

/** Parses newline-delimited "Main | Sub" lines into `{ main, sub }` department entries. */
function parseDepartments(text) {
    const lines = (text || '').split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
        throw new SettingsError('At least one department is required, one per line as "Main | Sub".', 'invalid-departments');
    }
    return lines.map(line => {
        const [main, sub] = line.split('|').map(part => (part || '').trim());
        if (!main || !sub) {
            throw new SettingsError('Each department line must be "Main | Sub".', 'invalid-departments');
        }
        return { main, sub };
    });
}

/** Parses a `<day>_start`/`<day>_end` form into a full `hoursByDay` map, validating every day. */
function parseHoursForm(form) {
    const hoursByDay = {};
    for (const day of DAYS) {
        const start = form.get(`${day}_start`) ?? '';
        const end = form.get(`${day}_end`) ?? '';
        if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
            throw new SettingsError(`Enter valid HH:MM hours for ${day}.`, 'invalid-hours');
        }
        if (start >= end) {
            throw new SettingsError(`${capitalize(day)}'s start time must be before its end time.`, 'invalid-hours');
        }
        hoursByDay[day] = { start, end };
    }
    return hoursByDay;
}

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}
