import * as XLSX from 'xlsx';
import { describe, it, expect } from 'vitest';
import { operatingHoursForDate, buildCompletedSchedule } from './scheduleCalculation.js';
import { DEFAULT_ADVANCED_SETTINGS, DEFAULT_HOURS_BY_DAY } from '../core/constants.js';

// Raw (pre-column-D-deletion) rows for a single day, shaped like a real UKG export: an
// early decorative "Dept/Job/Name" line (row 2), then the real column-header row (row 6)
// with a shift-label column D that deleteColumnD strips before scheduling.
function rawDayRows(date) {
    return [
        [`Date: ${date}`],
        ['Location: Test Store'],
        ['Dept', 'Job', 'Name'],
        [], [], [],
        ['Dept', 'Job', 'Name', 'Shift Label', 'Shift', '15', '30', '15'],
        ['Cashier', null, null, null, null],
        [null, 'Cashier', 'Smith, Alice', 'x', '8:00AM-4:30PM'],
        [null, 'Cashier', 'Jones, Bob', 'x', '9:00AM-3:00PM'],
        ['Clothing', null, null, null, null],
        [null, 'Clothing', 'Wilson, Dave', 'x', '10:00AM-2:00PM']
    ];
}

function testLocation(overrides = {}) {
    return {
        coverageGroups: [],
        settings: {
            jurisdiction: 'california',
            hoursByDay: DEFAULT_HOURS_BY_DAY,
            advanced: DEFAULT_ADVANCED_SETTINGS,
            ...overrides
        }
    };
}

describe('operatingHoursForDate', () => {
    it('converts the matching day-of-week HH:MM hours to minutes', () => {
        const hoursByDay = { ...DEFAULT_HOURS_BY_DAY, monday: { start: '09:00', end: '17:00' } };
        // 2024-01-15 is a Monday
        expect(operatingHoursForDate(hoursByDay, '2024-01-15')).toEqual({ startTime: 9 * 60, endTime: 17 * 60 });
    });

    it('falls back to 10:00-21:00 when hoursByDay is missing that day', () => {
        expect(operatingHoursForDate({}, '2024-01-15')).toEqual({ startTime: 10 * 60, endTime: 21 * 60 });
    });
});

describe('buildCompletedSchedule', () => {
    it('produces a single-day workbook with breaks written and the shift-label column removed', () => {
        const days = [{ date: '2024-01-15', rows: rawDayRows('2024-01-15') }];
        const { buffer, filename } = buildCompletedSchedule(days, testLocation());

        expect(filename).toBe('Break Schedule 2024-01-15.xlsx');

        const workbook = XLSX.read(buffer, { type: 'buffer' });
        expect(workbook.SheetNames).toEqual(['Schedule']);

        const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Schedule, { header: 1, defval: '' });

        // The real header row (row 6) survives dataStart detection past the decorative
        // "Dept/Job/Name" line at row 2, and the shift-label column is gone: 7 columns.
        expect(rows[6].slice(0, 7)).toEqual(['Dept', 'Job', 'Name', 'Shift', '15', '30', '15']);

        // Alice Smith's row: dept/job/name/shift intact (name cells are never rewritten —
        // only the break columns are), rest1/meal/rest2 populated.
        const aliceRow = rows[8];
        expect(aliceRow[2]).toBe('Smith, Alice');
        expect(aliceRow[3]).toBe('8:00AM-4:30PM');
        expect(aliceRow[4]).not.toBe('');
        expect(aliceRow[5]).not.toBe('');
        expect(aliceRow[6]).not.toBe('');
    });

    it('combines multiple days into one sheet with a date-spanning filename', () => {
        const days = [
            { date: '2024-01-15', rows: rawDayRows('2024-01-15') },
            { date: '2024-01-16', rows: rawDayRows('2024-01-16') }
        ];
        const { buffer, filename } = buildCompletedSchedule(days, testLocation());

        expect(filename).toBe('Break Schedule 2024-01-15 to 2024-01-16.xlsx');

        const workbook = XLSX.read(buffer, { type: 'buffer' });
        expect(workbook.SheetNames).toEqual(['Schedule']);

        const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Schedule, { header: 1, defval: '' });
        // Both days' header rows appear in the single combined sheet.
        const dayRowCount = rawDayRows('2024-01-15').length;
        expect(rows[6].slice(0, 7)).toEqual(['Dept', 'Job', 'Name', 'Shift', '15', '30', '15']);
        expect(rows[dayRowCount + 6].slice(0, 7)).toEqual(['Dept', 'Job', 'Name', 'Shift', '15', '30', '15']);
    });

    it('falls back gracefully to the california ruleset for an unrecognized jurisdiction', () => {
        const days = [{ date: '2024-01-15', rows: rawDayRows('2024-01-15') }];
        const location = testLocation({ jurisdiction: 'nevada' });

        expect(() => buildCompletedSchedule(days, location)).not.toThrow();
    });

    it('staggers rest breaks across coworkers in the same Location coverage group', () => {
        const rows = [
            ['Date: 2024-01-15'],
            ['Location: Test Store'],
            ['Dept', 'Job', 'Name'],
            [], [], [],
            ['Dept', 'Job', 'Name', 'Shift Label', 'Shift', '15', '30', '15'],
            ['Cashier', null, null, null, null],
            [null, 'Cashier', 'Smith, Alice', 'x', '9:00AM-3:00PM'],
            [null, 'Cashier', 'Jones, Bob', 'x', '9:00AM-3:00PM']
        ];
        const location = {
            coverageGroups: [{ id: 1, name: 'Cashier Group', departments: [{ main: 'Cashier', sub: 'Cashier' }] }],
            settings: { jurisdiction: 'california', hoursByDay: DEFAULT_HOURS_BY_DAY, advanced: DEFAULT_ADVANCED_SETTINGS }
        };

        const { buffer } = buildCompletedSchedule([{ date: '2024-01-15', rows }], location);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const outputRows = XLSX.utils.sheet_to_json(workbook.Sheets.Schedule, { header: 1, defval: '' });

        // Same coverage group, identical shifts: without staggering both would land on the
        // same "ideal" rest break time, leaving the department uncovered at that moment.
        expect(outputRows[8][4]).not.toBe('');
        expect(outputRows[9][4]).not.toBe('');
        expect(outputRows[8][4]).not.toBe(outputRows[9][4]);
    });
});
