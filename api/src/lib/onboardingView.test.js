import { describe, expect, it } from 'vitest';
import { renderCreateOrJoinPage, renderLinkedPage } from './onboardingView.js';

describe('onboardingView', () => {
    describe('renderCreateOrJoinPage', () => {
        it('renders both the create and join forms', () => {
            const html = renderCreateOrJoinPage();
            expect(html).toContain('/api/onboarding/create-company');
            expect(html).toContain('/api/onboarding/redeem-invite');
            expect(html).toContain('name="name"');
            expect(html).toContain('name="code"');
        });

        it('does not render an error block when there is no error', () => {
            expect(renderCreateOrJoinPage()).not.toContain('class="error"');
        });

        it('renders a supplied error message', () => {
            const html = renderCreateOrJoinPage({ error: 'That invite code has expired.' });
            expect(html).toContain('That invite code has expired.');
        });

        it('escapes HTML in the error message', () => {
            const html = renderCreateOrJoinPage({ error: '<script>alert(1)</script>' });
            expect(html).not.toContain('<script>alert(1)</script>');
            expect(html).toContain('&lt;script&gt;');
        });
    });

    describe('renderLinkedPage', () => {
        it('shows the company name and role', () => {
            const html = renderLinkedPage({ company: { name: 'Acme Outfitters' }, role: 'Admin' });
            expect(html).toContain('Acme Outfitters');
            expect(html).toContain('Admin');
        });

        it('escapes HTML in the company name', () => {
            const html = renderLinkedPage({ company: { name: '<b>Acme</b>' }, role: 'Admin' });
            expect(html).not.toContain('<b>Acme</b>');
            expect(html).toContain('&lt;b&gt;');
        });
    });
});
