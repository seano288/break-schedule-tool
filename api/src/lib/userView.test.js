import { describe, expect, it } from 'vitest';
import { renderUsersPage } from './userView.js';

describe('userView', () => {
    describe('renderUsersPage', () => {
        it('shows the invite form and per-User edit/revoke forms', () => {
            const html = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: 'alice@example.com', role: 'Manager' }]
            });

            expect(html).toContain('/api/users/invite');
            expect(html).toContain('/api/users/edit');
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

        it('renders a Location checkbox for each non-archived Location', () => {
            const html = renderUsersPage({
                users: [],
                locations: [{ id: 'loc-1', name: 'Downtown' }, { id: 'loc-2', name: 'Uptown' }]
            });

            expect(html).toContain('name="locationIds" value="loc-1"');
            expect(html).toContain('name="locationIds" value="loc-2"');
            expect(html).toContain('Downtown');
            expect(html).toContain('Uptown');
        });

        it('escapes HTML in a Location\'s name', () => {
            const html = renderUsersPage({
                users: [],
                locations: [{ id: 'loc-1', name: '<script>alert(1)</script>' }]
            });

            expect(html).not.toContain('<script>alert(1)</script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('renders no Location checkboxes when there are no Locations', () => {
            const html = renderUsersPage({ users: [], locations: [] });
            expect(html).not.toContain('name="locationIds"');
        });

        it('pre-checks a Manager\'s current Locations in their edit form', () => {
            const html = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: 'alice@example.com', role: 'Manager', locationIds: ['loc-1'] }],
                locations: [{ id: 'loc-1', name: 'Downtown' }, { id: 'loc-2', name: 'Uptown' }]
            });

            expect(html).toContain('value="loc-1" checked');
            expect(html).not.toContain('value="loc-2" checked');
        });

        it('hides the Location checkboxes in an Admin\'s edit form', () => {
            const html = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: 'alice@example.com', role: 'Admin', locationIds: [] }],
                locations: [{ id: 'loc-1', name: 'Downtown' }]
            });

            expect(html).toContain('class="user-edit-locations" hidden');
        });

        it('shows the Location checkboxes in a Manager\'s edit form', () => {
            const html = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: 'alice@example.com', role: 'Manager', locationIds: ['loc-1'] }],
                locations: [{ id: 'loc-1', name: 'Downtown' }]
            });

            expect(html).toContain('class="user-edit-locations" >');
        });

        it('includes the edit-form toggle script only when there are Locations', () => {
            const withLocations = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: 'alice@example.com', role: 'Manager', locationIds: [] }],
                locations: [{ id: 'loc-1', name: 'Downtown' }]
            });
            const withoutLocations = renderUsersPage({
                users: [{ userId: 'user-1', userDetails: 'alice@example.com', role: 'Manager', locationIds: [] }]
            });

            expect(withLocations).toContain('user-edit-form');
            expect(withoutLocations).not.toContain('<script>');
        });
    });
});
