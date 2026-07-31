/**
 * Server-rendered HTML for the Locations screen — template-literal based,
 * no client-side framework (see issue #1's frontend-stack decision), matching
 * onboardingView.js's plain-forms style.
 */

export function renderLocationsPage({ role, locations, error } = {}) {
    return page(`
        <h1>Locations</h1>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        ${role === 'Admin' ? '<p><a href="/api/company/template">Edit Company default template</a></p>' : ''}
        ${role === 'Admin' ? '<p><a href="/api/users">Manage Users</a></p>' : ''}
        ${role === 'Admin' ? renderCreateForm() : ''}
        ${renderLocationList(role, locations)}
    `);
}

function renderCreateForm() {
    return `
        <section>
            <h2>Add a Location</h2>
            <form method="post" action="/api/locations/create">
                <label for="name">Location name</label>
                <input type="text" id="name" name="name" required>
                <button type="submit">Create</button>
            </form>
        </section>
    `;
}

function renderLocationList(role, locations) {
    if (locations.length === 0) {
        return '<p>No locations yet.</p>';
    }
    return `<ul>${locations.map(location => renderLocationItem(role, location)).join('')}</ul>`;
}

function renderLocationItem(role, location) {
    const status = location.archived ? ' (Archived)' : '';
    const editLink = `<a href="/api/locations/edit?id=${encodeURIComponent(location.id)}">Manage coverage groups &amp; hours</a>`;
    if (role !== 'Admin') {
        return `<li>${escapeHtml(location.name)} ${editLink}</li>`;
    }

    return `
        <li>
            ${escapeHtml(location.name)}${status}
            ${editLink}
            <form method="post" action="/api/locations/rename">
                <input type="hidden" name="id" value="${escapeHtml(location.id)}">
                <input type="text" name="name" value="${escapeHtml(location.name)}" required>
                <button type="submit">Rename</button>
            </form>
            ${location.archived ? '' : `
                <form method="post" action="/api/locations/archive">
                    <input type="hidden" name="id" value="${escapeHtml(location.id)}">
                    <button type="submit">Archive</button>
                </form>
            `}
        </li>
    `;
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
