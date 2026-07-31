import { describe, expect, it } from 'vitest';
import { renderUsersPage } from './userView.js';

describe('userView', () => {
    describe('renderUsersPage', () => {
        it('shows the invite form and per-User role-change/revoke forms', () => {
            const html = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: 'alice@example.com', role: 'Manager' }]
            });

            expect(html).toContain('/api/users/invite');
            expect(html).toContain('/api/users/role');
            expect(html).toContain('/api/users/revoke');
            expect(html).toContain('alice@example.com');
            expect(html).toContain('value="user-1"');
        });

        it('falls back to the userId when userDetails is missing', () => {
            const html = renderUsersPage({ users: [{ userId: 'user-1', userDetails: null, role: 'Manager' }] });

            expect(html).toContain('user-1');
        });

        it('shows a message when there are no Users', () => {
            const html = renderUsersPage({ users: [] });
            expect(html).toContain('No users yet.');
        });

        it('does not render an error or notice block when neither is supplied', () => {
            const html = renderUsersPage({ users: [] });
            expect(html).not.toContain('class="error"');
            expect(html).not.toContain('class="notice"');
        });

        it('renders a supplied error message', () => {
            const html = renderUsersPage({ users: [], error: 'User not found.' });
            expect(html).toContain('User not found.');
        });

        it('renders a supplied notice message', () => {
            const html = renderUsersPage({ users: [], notice: 'Invite code: abc-123' });
            expect(html).toContain('Invite code: abc-123');
        });

        it('escapes HTML in a User\'s userDetails', () => {
            const html = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: '<script>alert(1)</script>', role: 'Manager' }]
            });
            expect(html).not.toContain('<script>alert(1)</script>');
            expect(html).toContain('&lt;script&gt;');
        });
    });
});
