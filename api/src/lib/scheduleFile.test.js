import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseScheduleForReview, extractDepartments } from './scheduleFile.js';

const VALID_ROWS = [
    ['Date: 2024-01-15'],
    ['Location: Test Store'],
    ['Dept', 'Job', 'Name'],
    [], [], [],
    ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'],
    ['Cashier', null, null, null],
    [null, 'Cashier', 'Smith, Alice', '8:00AM-4:30PM'],
    [null, 'Cashier', 'Jones, Bob', '9:00AM-3:00PM'],
    ['Clothing', null, null, null],
    [null, 'Clothing', 'Wilson, Dave', '10:00AM-2:00PM']
];

function bufferFromRows(rows) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Schedule');
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

describe('parseScheduleForReview', () => {
    it('rejects a file with no "Name" column header', () => {
        const buffer = bufferFromRows(Array.from({ length: 8 }, (_, i) => ['just', 'some', 'random', `data ${i}`]));

        const result = parseScheduleForReview(buffer);

        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/UKG schedule export/i);
    });

    it('rejects unreadable binary data', () => {
        const result = parseScheduleForReview(Buffer.from('PK\x03\x04garbagegarbagegarbagegarbage'));

        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/Could not read file/i);
    });

    it('parses a valid single-day schedule into raw per-day rows', () => {
        const buffer = bufferFromRows(VALID_ROWS);

        const result = parseScheduleForReview(buffer);

        expect(result.isValid).toBe(true);
        expect(result.days).toHaveLength(1);
        expect(result.days[0].date).toBe('2024-01-15');
        // Round-tripped through XLSX (not compared against VALID_ROWS directly, since
        // sheet_to_json represents empty cells as `undefined` rather than the literal
        // `null`s used above) — extractDepartments below covers the meaningful content.
        expect(result.days[0].rows[6]).toEqual(['Dept', 'Job', 'Name', 'Shift', '15', '30', '15']);
        expect(result.days[0].rows[8][2]).toBe('Smith, Alice');
    });

    it('splits a multi-day export into one entry per day', () => {
        const secondDay = [
            ['Date: 2024-01-16'],
            ['Location: Test Store'],
            ['Dept', 'Job', 'Name'],
            [], [], [],
            ['Dept', 'Job', 'Name', 'Shift', '15', '30', '15'],
            ['Cashier', null, null, null],
            [null, 'Cashier', 'Lee, Grace', '7:00AM-3:00PM']
        ];
        const buffer = bufferFromRows([...VALID_ROWS, ...secondDay]);

        const result = parseScheduleForReview(buffer);

        expect(result.isValid).toBe(true);
        expect(result.days).toHaveLength(2);
        expect(result.days[0].date).toBe('2024-01-15');
        expect(result.days[1].date).toBe('2024-01-16');
        expect(extractDepartments(result.days[1].rows)[0].employees).toEqual([
            { name: 'Grace Lee', job: 'Cashier', shift: '7:00AM-3:00PM' }
        ]);
    });
});

describe('extractDepartments', () => {
    it('groups employees under their department, reformatting names to "First Last"', () => {
        expect(extractDepartments(VALID_ROWS)).toEqual([
            {
                name: 'Cashier',
                employees: [
                    { name: 'Alice Smith', job: 'Cashier', shift: '8:00AM-4:30PM' },
                    { name: 'Bob Jones', job: 'Cashier', shift: '9:00AM-3:00PM' }
                ]
            },
            {
                name: 'Clothing',
                employees: [
                    { name: 'Dave Wilson', job: 'Clothing', shift: '10:00AM-2:00PM' }
                ]
            }
        ]);
    });
});
