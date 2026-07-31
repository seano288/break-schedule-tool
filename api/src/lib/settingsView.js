/**
 * Server-rendered HTML for editing a Location's coverage groups/hours, and the
 * Company's default template of the same shape — template-literal based, no
 * client-side framework (see issue #1's frontend-stack decision), matching
 * locationView.js's plain-forms style.
 */

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function renderLocationEditPage({ location, error } = {}) {
    return page(`
        <h1>${escapeHtml(location.name)}</h1>
        <p><a href="/api/locations">Back to Locations</a></p>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        ${renderCoverageGroupsSection('locations', location.id, location.coverageGroups)}
        ${renderHoursSection('locations', location.id, location.settings.hoursByDay)}
    `);
}

export function renderCompanyTemplatePage({ company, error } = {}) {
    return page(`
        <h1>Company default template</h1>
        <p><a href="/api/locations">Back to Locations</a></p>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        ${renderCoverageGroupsSection('company/template', null, company.defaultCoverageGroups)}
        ${renderHoursSection('company/template', null, company.defaultSettings.hoursByDay)}
    `);
}

function renderCoverageGroupsSection(basePath, locationId, groups) {
    return `
        <section>
            <h2>Coverage groups</h2>
            ${groups.length === 0 ? '<p>No coverage groups yet.</p>' : `<ul>${groups.map(g => renderCoverageGroupItem(basePath, locationId, g)).join('')}</ul>`}
            <h3>Add a coverage group</h3>
            <form method="post" action="/api/${basePath}/coverage-groups/create">
                ${hiddenLocationField(locationId)}
                ${renderGroupFields()}
                <button type="submit">Add</button>
            </form>
        </section>
    `;
}

function renderCoverageGroupItem(basePath, locationId, group) {
    const departmentsText = group.departments.map(d => `${d.main} | ${d.sub}`).join('\n');
    return `
        <li>
            <form method="post" action="/api/${basePath}/coverage-groups/update">
                ${hiddenLocationField(locationId)}
                <input type="hidden" name="id" value="${group.id}">
                ${renderGroupFields(group.name, departmentsText)}
                <button type="submit">Save</button>
            </form>
            <form method="post" action="/api/${basePath}/coverage-groups/delete">
                ${hiddenLocationField(locationId)}
                <input type="hidden" name="id" value="${group.id}">
                <button type="submit">Delete</button>
            </form>
        </li>
    `;
}

function renderGroupFields(name = '', departmentsText = '') {
    return `
        <label>Name<br><input type="text" name="name" value="${escapeHtml(name)}" required></label><br>
        <label>Departments (one per line, "Main | Sub")<br>
            <textarea name="departments" required>${escapeHtml(departmentsText)}</textarea>
        </label>
    `;
}

function renderHoursSection(basePath, locationId, hoursByDay) {
    return `
        <section>
            <h2>Operating hours</h2>
            <form method="post" action="/api/${basePath}/hours">
                ${hiddenLocationField(locationId)}
                ${DAYS.map(day => renderDayRow(day, hoursByDay[day])).join('')}
                <button type="submit">Save hours</button>
            </form>
        </section>
    `;
}

function renderDayRow(day, hours) {
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    return `
        <div>
            <label>${label}
                <input type="time" name="${day}_start" value="${escapeHtml(hours?.start ?? '')}" required>
                to
                <input type="time" name="${day}_end" value="${escapeHtml(hours?.end ?? '')}" required>
            </label>
        </div>
    `;
}

function hiddenLocationField(locationId) {
    return locationId ? `<input type="hidden" name="locationId" value="${escapeHtml(locationId)}">` : '';
}

function page(body) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Break Schedule Tool</title>
</head>
<body>
    ${body}
</body>
</html>`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}
