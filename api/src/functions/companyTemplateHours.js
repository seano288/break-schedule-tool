import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runTemplateSettingsAction } from '../lib/settingsHttp.js';
import { setTemplateHours } from '../lib/settingsService.js';

export async function companyTemplateHoursHandler(request) {
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

    const form = new URLSearchParams(await request.text());
    return runTemplateSettingsAction(facade, link.companyId, () =>
        setTemplateHours(facade, { companyId: link.companyId }, form)
    );
}

app.http('companyTemplateHours', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'company/template/hours',
    handler: companyTemplateHoursHandler
});
