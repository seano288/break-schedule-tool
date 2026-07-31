import { UserError, listUsersForCompany } from './userService.js';
import { renderUsersPage } from './userView.js';

const STATUS_BY_REASON = {
    'invalid-role': 400,
    'not-found': 404
};

/**
 * Runs a User mutation (role-change/revoke) and maps the shared result shape: a 303
 * to the Users list on success, or the Users list re-rendered with a clear error on
 * an expected failure.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string }} link
 * @param {() => Promise<void>} action
 */
export async function runUserAction(facade, link, action) {
    try {
        await action();
    } catch (err) {
        if (err instanceof UserError) {
            return renderUsersError(facade, link, err);
        }
        throw err;
    }

    return { status: 303, headers: { location: '/api/users' } };
}

/**
 * Runs invite-code generation. Unlike runUserAction, this can't redirect on success —
 * the generated code only exists in this response, so it re-renders the Users list
 * with the code surfaced in a notice.
 *
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ companyId: string }} link
 * @param {() => Promise<{code: string, role: string, expiresAt: string}>} action
 */
export async function runUserInviteAction(facade, link, action) {
    let invite;
    try {
        invite = await action();
    } catch (err) {
        if (err instanceof UserError) {
            return renderUsersError(facade, link, err);
        }
        throw err;
    }

    const users = await listUsersForCompany(facade, { companyId: link.companyId });
    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderUsersPage({
            users,
            notice: `Invite code for ${invite.role}: ${invite.code} (expires ${invite.expiresAt})`
        })
    };
}

async function renderUsersError(facade, link, err) {
    const users = await listUsersForCompany(facade, { companyId: link.companyId });
    return {
        status: STATUS_BY_REASON[err.reason] ?? 400,
        headers: { 'content-type': 'text/html' },
        body: renderUsersPage({ users, error: err.message })
    };
}
