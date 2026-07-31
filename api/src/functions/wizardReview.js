import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { assertLocationEditableByViewer } from '../lib/settingsService.js';
import { ScopeError } from '../lib/companyScope.js';
import { settingsErrorResponse } from '../lib/settingsHttp.js';
import { renderWizardUploadPage, renderWizardReviewPage } from '../lib/wizardView.js';
import { parseScheduleForReview } from '../lib/scheduleFile.js';

export async function wizardReviewHandler(request) {
    const principal = parseClientPrincipal(request.headers.get('x-ms-client-principal'));
    if (!principal) {
        return { status: 401, jsonBody: { error: 'Unauthenticated' } };
    }

    const facade = await getFacade();
    const link = await facade.getUserLink(principal.userId);
    if (!link) {
        return { status: 303, headers: { location: '/api/onboarding' } };
    }

    const form = await request.formData();
    const locationId = form.get('locationId');

    let location;
    try {
        location = await assertLocationEditableByViewer(facade, { ...link, locationId });
    } catch (err) {
        if (err instanceof ScopeError) {
            return settingsErrorResponse(err);
        }
        throw err;
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') {
        return {
            status: 400,
            headers: { 'content-type': 'text/html' },
            body: renderWizardUploadPage({ location, error: 'Please choose a file to upload.' })
        };
    }

    const buffer = await file.arrayBuffer();
    const result = parseScheduleForReview(buffer);

    if (!result.isValid) {
        return {
            status: 400,
            headers: { 'content-type': 'text/html' },
            body: renderWizardUploadPage({ location, error: result.error })
        };
    }

    return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderWizardReviewPage({ location, days: result.days })
    };
}

app.http('wizardReview', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'wizard/review',
    handler: wizardReviewHandler
});
