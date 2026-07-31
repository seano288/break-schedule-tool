import { app } from '@azure/functions';
import { parseClientPrincipal } from '../lib/clientPrincipal.js';
import { getFacade } from '../lib/facadeInstance.js';
import { assertLocationEditableByViewer } from '../lib/settingsService.js';
import { ScopeError } from '../lib/companyScope.js';
import { settingsErrorResponse } from '../lib/settingsHttp.js';
import { renderWizardUploadPage } from '../lib/wizardView.js';
import { buildCompletedSchedule } from '../lib/scheduleCalculation.js';

// `date` ends up in the downloaded filename (and the Content-Disposition header) unescaped —
// requiring this shape closes off header-injection via a hand-crafted scheduleData payload.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function wizardCalculateHandler(request) {
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

    const days = parseScheduleDataField(form.get('scheduleData'));
    if (!days) {
        return {
            status: 400,
            headers: { 'content-type': 'text/html' },
            body: renderWizardUploadPage({ location, error: 'Missing or invalid schedule data. Please upload your file again.' })
        };
    }

    // Nothing about the uploaded schedule — employee names, shifts, computed breaks — is
    // ever written to Table Storage or any other persistent store; the workbook produced
    // here lives only in this request's memory before being streamed back to the caller.
    const { buffer, filename } = buildCompletedSchedule(days, location);

    return {
        status: 200,
        headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content-disposition': `attachment; filename="${filename}"`
        },
        body: buffer
    };
}

/** Parses+validates the review step's `scheduleData` hidden field. Returns null if malformed. */
function parseScheduleDataField(value) {
    if (typeof value !== 'string') return null;

    let days;
    try {
        days = JSON.parse(value);
    } catch {
        return null;
    }

    const isValid = Array.isArray(days) && days.length > 0 && days.every(day =>
        day && DATE_PATTERN.test(day.date) && Array.isArray(day.rows)
    );

    return isValid ? days : null;
}

app.http('wizardCalculate', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'wizard/calculate',
    handler: wizardCalculateHandler
});
