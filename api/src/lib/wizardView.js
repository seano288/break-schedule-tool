/**
 * Server-rendered HTML for the schedule-processing wizard's select -> upload -> review
 * steps — template-literal based, no client-side framework (see issue #1's frontend-stack
 * decision), matching locationView.js/settingsView.js's plain-forms style.
 */

export function renderWizardSelectPage({ locations, error } = {}) {
    const active = locations.filter(location => !location.archived);
    return page(`
        <h1>Process a schedule</h1>
        <p><a href="/api/locations">Back to Locations</a></p>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        ${active.length === 0 ? '<p>No Locations available.</p>' : `<ul>${active.map(renderLocationLink).join('')}</ul>`}
    `);
}

function renderLocationLink(location) {
    return `<li><a href="/api/wizard/upload?locationId=${encodeURIComponent(location.id)}">${escapeHtml(location.name)}</a></li>`;
}

export function renderWizardUploadPage({ location, error } = {}) {
    return page(`
        <h1>Upload schedule: ${escapeHtml(location.name)}</h1>
        <p><a href="/api/wizard">Back to Location selection</a></p>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        <form method="post" action="/api/wizard/review" enctype="multipart/form-data">
            <input type="hidden" name="locationId" value="${escapeHtml(location.id)}">
            <label>UKG daily schedule (.xlsx)<br>
                <input type="file" name="file" accept=".xlsx" required>
            </label>
            <button type="submit">Upload &amp; review</button>
        </form>
    `);
}

export function renderWizardReviewPage({ location, days }) {
    return page(`
        <h1>Review schedule: ${escapeHtml(location.name)}</h1>
        <p><a href="/api/wizard">Start over</a></p>
        ${days.map(renderDay).join('')}
        <form method="post" action="/api/wizard/calculate">
            <input type="hidden" name="locationId" value="${escapeHtml(location.id)}">
            <input type="hidden" name="scheduleData" value="${escapeHtml(JSON.stringify(days))}">
            <button type="submit">Calculate breaks</button>
        </form>
    `);
}

function renderDay(day) {
    return `
        <section>
            <h2>${escapeHtml(day.date)}</h2>
            ${day.departments.map(renderDepartment).join('')}
        </section>
    `;
}

function renderDepartment(department) {
    return `
        <h3>${escapeHtml(department.name)}</h3>
        <ul>
            ${department.employees.map(renderEmployee).join('')}
        </ul>
    `;
}

function renderEmployee(employee) {
    return `<li>${escapeHtml(employee.name)} (${escapeHtml(employee.job)}) — ${escapeHtml(employee.shift)}</li>`;
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
