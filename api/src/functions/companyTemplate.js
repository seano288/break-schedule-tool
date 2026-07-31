import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { renderCompanyTemplatePage } from '../lib/settingsView.js';

export async function companyTemplateHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const link = await facade.getUserLink(principal.userId);
    if (!link) {
        return { status: 303, headers: { location: '/api/onboarding' } };
    }
    if (link.role !== 'Admin') {
        return { status: 403, jsonBody: { error: 'Forbidden' } };
    }

    const company = await facade.getCompany(link.companyId);
    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderCompanyTemplatePage({ company })
    };
}

app.http('companyTemplate', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'company/template',
    handler: companyTemplateHandler
});
