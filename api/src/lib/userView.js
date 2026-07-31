/**
 * Server-rendered HTML for the Users screen — Admin-only, matching
 * locationView.js/onboardingView.js's plain-forms style.
 */

export function renderUsersPage({ users, error, notice } = {}) {
    return page(`
        <h1>Users</h1>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        ${notice ? `<p class="notice">${escapeHtml(notice)}</p>` : ''}
        ${renderInviteForm()}
        ${renderUserList(users)}
    `);
}

function renderInviteForm() {
    return `
        <section>
            <h2>Invite a User</h2>
            <form method="post" action="/api/users/invite">
                <label for="role">Role</label>
                <select id="role" name="role" required>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                </select>
                <button type="submit">Generate invite code</button>
            </form>
        </section>
    `;
}

function renderUserList(users) {
    if (users.length === 0) {
        return '<p>No users yet.</p>';
    }
    return `<ul>${users.map(renderUserItem).join('')}</ul>`;
}

function renderUserItem(user) {
    const label = escapeHtml(user.userDetails || user.userId);
    return `
        <li>
            ${label} — ${escapeHtml(user.role)}
            <form method="post" action="/api/users/role">
                <input type="hidden" name="userId" value="${escapeHtml(user.userId)}">
                <select name="role" required>
                    <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="Manager" ${user.role === 'Manager' ? 'selected' : ''}>Manager</option>
                </select>
                <button type="submit">Change role</button>
            </form>
            <form method="post" action="/api/users/revoke">
                <input type="hidden" name="userId" value="${escapeHtml(user.userId)}">
                <button type="submit">Revoke access</button>
            </form>
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
