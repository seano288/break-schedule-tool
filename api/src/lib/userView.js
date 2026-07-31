/**
 * Server-rendered HTML for the Users screen — Admin-only, matching
 * locationView.js/onboardingView.js's plain-forms style, plus small inline
 * scripts on the invite form and each per-User edit form to toggle/require the
 * Location checkboxes client-side (the server independently enforces the same rule).
 */

export function renderUsersPage({ users, locations = [], error, notice } = {}) {
    return page(`
        <h1>Users</h1>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
        ${notice ? `<p class="notice">${escapeHtml(notice)}</p>` : ''}
        ${renderInviteForm(locations)}
        ${renderUserList(users, locations)}
        ${locations.length > 0 ? renderUserEditFormScript() : ''}
    `);
}

function renderInviteForm(locations) {
    const hasLocations = locations.length > 0;
    return `
        <section>
            <h2>Invite a User</h2>
            <form method="post" action="/api/users/invite" id="invite-form">
                <label for="role">Role</label>
                <select id="role" name="role" required>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                </select>
                ${hasLocations ? renderInviteLocations(locations) : ''}
                <button type="submit" id="invite-submit">Generate invite code</button>
            </form>
        </section>
        ${hasLocations ? renderInviteFormScript() : ''}
    `;
}

function renderInviteLocations(locations) {
    return `
        <div id="invite-locations">
            <p>Locations</p>
            <ul>
                ${locations.map(location => `
                    <li>
                        <label>
                            <input type="checkbox" name="locationIds" value="${escapeHtml(location.id)}">
                            ${escapeHtml(location.name)}
                        </label>
                    </li>
                `).join('')}
            </ul>
            <p class="error" id="invite-locations-message" hidden>Select at least one Location.</p>
        </div>
    `;
}

function renderInviteFormScript() {
    return `
        <script>
        (function () {
            var form = document.getElementById('invite-form');
            var roleSelect = document.getElementById('role');
            var locationsSection = document.getElementById('invite-locations');
            var message = document.getElementById('invite-locations-message');
            var submitButton = document.getElementById('invite-submit');

            function checkboxes() {
                return Array.prototype.slice.call(form.querySelectorAll('input[name="locationIds"]'));
            }

            function isManagerBlocked() {
                return roleSelect.value === 'Manager' && !checkboxes().some(function (cb) { return cb.checked; });
            }

            function update() {
                var isManager = roleSelect.value === 'Manager';
                locationsSection.hidden = !isManager;
                var blocked = isManagerBlocked();
                message.hidden = !blocked;
                submitButton.disabled = blocked;
            }

            form.addEventListener('submit', function (event) {
                if (isManagerBlocked()) {
                    event.preventDefault();
                }
            });
            roleSelect.addEventListener('change', update);
            checkboxes().forEach(function (cb) { cb.addEventListener('change', update); });
            update();
        })();
        </script>
    `;
}

function renderUserList(users, locations) {
    if (users.length === 0) {
        return '<p>No users yet.</p>';
    }
    return `<ul>${users.map(user => renderUserItem(user, locations)).join('')}</ul>`;
}

function renderUserItem(user, locations) {
    const label = escapeHtml(user.userDetails || user.userId);
    const hasLocations = locations.length > 0;
    return `
        <li>
            ${label}
            <form method="post" action="/api/users/edit" class="user-edit-form">
                <input type="hidden" name="userId" value="${escapeHtml(user.userId)}">
                <select name="role" class="user-edit-role" required>
                    <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="Manager" ${user.role === 'Manager' ? 'selected' : ''}>Manager</option>
                </select>
                ${hasLocations ? renderUserEditLocations(locations, user) : ''}
                <button type="submit">Save</button>
            </form>
            <form method="post" action="/api/users/revoke">
                <input type="hidden" name="userId" value="${escapeHtml(user.userId)}">
                <button type="submit">Revoke access</button>
            </form>
        </li>
    `;
}

function renderUserEditLocations(locations, user) {
    const isManager = user.role === 'Manager';
    const checkedIds = new Set(user.locationIds ?? []);
    return `
        <div class="user-edit-locations" ${isManager ? '' : 'hidden'}>
            <ul>
                ${locations.map(location => `
                    <li>
                        <label>
                            <input type="checkbox" name="locationIds" value="${escapeHtml(location.id)}" ${checkedIds.has(location.id) ? 'checked' : ''}>
                            ${escapeHtml(location.name)}
                        </label>
                    </li>
                `).join('')}
            </ul>
            <p class="error user-edit-locations-message" hidden>Select at least one Location.</p>
        </div>
    `;
}

function renderUserEditFormScript() {
    return `
        <script>
        (function () {
            function checkboxesFor(form) {
                return Array.prototype.slice.call(form.querySelectorAll('input[name="locationIds"]'));
            }

            function initForm(form) {
                var roleSelect = form.querySelector('.user-edit-role');
                var locationsSection = form.querySelector('.user-edit-locations');
                if (!locationsSection) return;
                var message = form.querySelector('.user-edit-locations-message');
                var submitButton = form.querySelector('button[type="submit"]');

                function isManagerBlocked() {
                    return roleSelect.value === 'Manager' && !checkboxesFor(form).some(function (cb) { return cb.checked; });
                }

                function update() {
                    var isManager = roleSelect.value === 'Manager';
                    locationsSection.hidden = !isManager;
                    var blocked = isManagerBlocked();
                    message.hidden = !blocked;
                    submitButton.disabled = blocked;
                }

                form.addEventListener('submit', function (event) {
                    if (isManagerBlocked()) {
                        event.preventDefault();
                    }
                });
                roleSelect.addEventListener('change', update);
                checkboxesFor(form).forEach(function (cb) { cb.addEventListener('change', update); });
                update();
            }

            Array.prototype.slice.call(document.querySelectorAll('.user-edit-form')).forEach(initForm);
        })();
        </script>
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
