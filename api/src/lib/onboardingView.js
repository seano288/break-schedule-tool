/**
 * Server-rendered HTML for the onboarding screen — template-literal based,
 * no client-side framework (see issue #1's frontend-stack decision). Plain
 * forms + full-page navigation for this screen; htmx is introduced later
 * (#9/#10) where step-to-step fragment swaps are actually needed.
 */

export function renderCreateOrJoinPage({ error } = {}) {
    return page(`
        <h1>Welcome</h1>
        <p>Create a new Company, or join one with an invite code.</p>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}

        <section>
            <h2>Create a Company</h2>
            <form method="post" action="/api/onboarding/create-company">
                <label for="name">Company name</label>
                <input type="text" id="name" name="name" required>
                <button type="submit">Create</button>
            </form>
        </section>

        <section>
            <h2>Join a Company</h2>
            <form method="post" action="/api/onboarding/redeem-invite">
                <label for="code">Invite code</label>
                <input type="text" id="code" name="code" required>
                <button type="submit">Join</button>
            </form>
        </section>
    `);
}

export function renderLinkedPage({ company, role }) {
    return page(`
        <h1>You're all set</h1>
        <p>You're linked to <strong>${escapeHtml(company.name)}</strong> as ${escapeHtml(role)}.</p>
    `);
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
