import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { runTemplateSettingsAction } from '../lib/settingsHttp.js';
import { addTemplateCoverageGroup } from '../lib/settingsService.js';

export async function companyTemplateCoverageGroupsCreateHandler(request) {
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
        addTemplateCoverageGroup(facade, { companyId: link.companyId, name: form.get('name'), departments: form.get('departments') })
    );
}

app.http('companyTemplateCoverageGroupsCreate', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'company/template/coverage-groups/create',
    handler: companyTemplateCoverageGroupsCreateHandler
});
