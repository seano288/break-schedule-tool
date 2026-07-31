import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { assertLocationEditableByViewer } from '../lib/settingsService.js';
import { ScopeError } from '../lib/companyScope.js';
import { settingsErrorResponse } from '../lib/settingsHttp.js';
import { renderWizardUploadPage } from '../lib/wizardView.js';

export async function wizardUploadHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const link = await facade.getUserLink(principal.userId);
    if (!link) {
        return { status: 303, headers: { location: '/api/onboarding' } };
    }

    const locationId = request.query.get('locationId');
    let location;
    try {
        location = await assertLocationEditableByViewer(facade, { ...link, locationId });
    } catch (err) {
        if (err instanceof ScopeError) {
            return settingsErrorResponse(err);
        }
        throw err;
    }

    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderWizardUploadPage({ location })
    };
}

app.http('wizardUpload', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'wizard/upload',
    handler: wizardUploadHandler
});
