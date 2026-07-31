import { scheduleBreaks } from '../core/BreakScheduler.js';
import { minutesToTime, timeToMinutes } from '../core/helpers.js';
import { getRuleset } from '../core/rulesets/index.js';
import { ExcelFacade } from '../facades/ExcelFacade.js';
import { findDataStart } from './scheduleFile.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DEFAULT_DAY_HOURS = { start: '10:00', end: '21:00' };

const excel = new ExcelFacade();

/**
 * Resolves a Location's per-day operating hours (HH:MM strings) for a given date into
 * minutes-since-midnight, the shape `scheduleBreaks` expects. Mirrors
 * src/models/SettingsModel.js's getOperatingHoursForDate.
 *
 * @param {Object} hoursByDay - Location.settings.hoursByDay
 * @param {string} dateString - "YYYY-MM-DD"
 * @returns {{ startTime: number, endTime: number }}
 */
export function operatingHoursForDate(hoursByDay, dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    const dayName = DAY_NAMES[date.getDay()];
    const day = (hoursByDay && hoursByDay[dayName]) || DEFAULT_DAY_HOURS;

    return {
        startTime: timeToMinutes(day.start),
        endTime: timeToMinutes(day.end)
    };
}

/**
 * Runs the break-scheduling engine over every uploaded day and produces a completed,
 * formatted .xlsx workbook — the server-side equivalent of
 * src/controllers/SchedulerController.js's file-processing pipeline. Nothing here is
 * persisted: the input `days` and the resulting buffer live only in this call's memory.
 *
 * @param {Array<{ date: string, rows: Array<Array> }>} days - Raw per-day rows, exactly
 *   as carried forward from the review step's `scheduleData` hidden field.
 * @param {Object} location - The Location these breaks are being computed for.
 * @param {Array} location.coverageGroups
 * @param {{ jurisdiction: string, hoursByDay: Object, advanced: Object }} location.settings
 * @returns {{ buffer: Buffer, filename: string }}
 */
export function buildCompletedSchedule(days, location) {
    const { coverageGroups, settings } = location;
    const ruleset = getRuleset(settings.jurisdiction);
    const workbook = excel.createWorkbook();

    if (days.length === 1) {
        const sheet = processDay(days[0], coverageGroups, settings, ruleset);
        excel.appendSheet(workbook, sheet, 'Schedule');
    } else {
        let combinedRows = [];
        const pageBreaks = [];

        for (let i = 0; i < days.length; i++) {
            if (i > 0) pageBreaks.push(combinedRows.length);

            const sheet = processDay(days[i], coverageGroups, settings, ruleset);
            combinedRows = combinedRows.concat(excel.sheetToRows(sheet));
        }

        const sheet = excel.createSheet(combinedRows);
        excel.applyMultiDayStyling(sheet, combinedRows, days);
        sheet['!rowBreaks'] = pageBreaks.map(r => ({ R: r, man: 1 }));
        excel.appendSheet(workbook, sheet, 'Schedule');
    }

    return { buffer: excel.toBuffer(workbook), filename: buildFilename(days) };
}

function processDay(day, coverageGroups, settings, ruleset) {
    const sheet = excel.createSheet(day.rows);

    // Delete column D (shift label) from the sheet and rows
    excel.deleteColumnD(sheet, day.rows);

    const dataStart = findDataStart(day.rows);
    const operatingHours = operatingHoursForDate(settings.hoursByDay, day.date);

    const { breaks, segments } = scheduleBreaks(day.rows, {
        operatingHours,
        groups: coverageGroups,
        advancedSettings: settings.advanced,
        ruleset,
        enableLogging: false,
        dataStart,
        shiftColumnIndex: 3 // After deleting column D, shift is now in col D (index 3)
    });

    excel.writeBreaks(sheet, segments, breaks, dataStart - 1, minutesToTime);
    excel.applyScheduleStyling(sheet, day.rows);

    return sheet;
}

function buildFilename(days) {
    const first = days[0].date;
    const last = days[days.length - 1].date;
    return first === last
        ? `Break Schedule ${first}.xlsx`
        : `Break Schedule ${first} to ${last}.xlsx`;
}
