import { describe, expect, it } from 'vitest';
import { renderLocationsPage } from './locationView.js';

describe('locationView', () => {
    describe('renderLocationsPage', () => {
        it('shows an Admin the create form and per-Location rename/archive forms', () => {
            const html = renderLocationsPage({
                role: 'Admin',
                locations: [{ id: 'loc-1', name: 'Downtown', archived: false }]
            });

            expect(html).toContain('/api/locations/create');
            expect(html).toContain('/api/locations/rename');
            expect(html).toContain('/api/locations/archive');
            expect(html).toContain('Downtown');
            expect(html).toContain('value="loc-1"');
        });

        it('does not show an archive form for an already-archived Location', () => {
            const html = renderLocationsPage({
                role: 'Admin',
                locations: [{ id: 'loc-1', name: 'Downtown', archived: true }]
            });

            expect(html).not.toContain('/api/locations/archive');
        });

        it('shows a Manager a read-only list with no forms', () => {
            const html = renderLocationsPage({
                role: 'Manager',
                locations: [{ id: 'loc-1', name: 'Downtown', archived: false }]
            });

            expect(html).not.toContain('/api/locations/create');
            expect(html).not.toContain('/api/locations/rename');
            expect(html).not.toContain('/api/locations/archive');
            expect(html).toContain('Downtown');
        });

        it('does not render an error block when there is no error', () => {
            expect(renderLocationsPage({ role: 'Admin', locations: [] })).not.toContain('class="error"');
        });

        it('renders a supplied error message', () => {
            const html = renderLocationsPage({ role: 'Admin', locations: [], error: 'Location not found.' });
            expect(html).toContain('Location not found.');
        });

        it('escapes HTML in a Location name', () => {
            const html = renderLocationsPage({
                role: 'Admin',
                locations: [{ id: 'loc-1', name: '<script>alert(1)</script>', archived: false }]
            });
            expect(html).not.toContain('<script>alert(1)</script>');
            expect(html).toContain('&lt;script&gt;');
        });
    });
});
