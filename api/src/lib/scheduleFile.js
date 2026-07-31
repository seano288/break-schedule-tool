import * as XLSX from 'xlsx';

/**
 * Parses and validates an uploaded UKG daily-schedule .xlsx export, entirely in memory,
 * into a review-ready summary of departments/employees/shifts for each day found in the
 * file. Mirrors src/facades/ExcelFacade.js's parseWorkbook/validateScheduleStructure/
 * splitIntoDailySchedules logic and src/core/BreakScheduler.js's department/employee row
 * detection, but is duplicated here rather than imported: api/ is deployed standalone
 * (see api/src/lib/defaultTemplate.js's note), so a relative import reaching outside
 * api/ would work locally but not in production.
 *
 * @param {ArrayBuffer|Buffer} buffer
 * @returns {{ isValid: true, days: Array<{ date: string, departments: Array<{ name: string, employees: Array<{ name: string, job: string, shift: string }> }> }> } | { isValid: false, error: string }}
 */
export function parseScheduleForReview(buffer) {
    const parsed = parseWorkbook(buffer);
    if (!parsed.isValid) {
        return { isValid: false, error: parsed.error };
    }

    const structure = validateScheduleStructure(parsed.rowData);
    if (!structure.isValid) {
        return { isValid: false, error: structure.error };
    }

    const days = splitIntoDailySchedules(parsed.rowData).map(({ date, rows }) => ({
        date,
        departments: extractDepartments(rows)
    }));

    if (!days.length) {
        return { isValid: false, error: 'No valid schedule found in the uploaded file.' };
    }

    return { isValid: true, days };
}

function parseWorkbook(buffer) {
    try {
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });

        if (!workbook.SheetNames.length) {
            return { rowData: [], isValid: false, error: 'The file contains no sheets.' };
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rowData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!rowData.length) {
            return { rowData: [], isValid: false, error: 'The file appears to be empty.' };
        }

        return { rowData, isValid: true, error: null };
    } catch (e) {
        return { rowData: [], isValid: false, error: `Could not read file: ${e.message}` };
    }
}

function validateScheduleStructure(rowData) {
    if (!rowData || rowData.length < 8) {
        return { isValid: false, error: 'File has too few rows to be a valid schedule.' };
    }

    const hasNameHeader = rowData.slice(0, 10).some(row =>
        row && row.some(cell => typeof cell === 'string' && cell.trim().toLowerCase() === 'name')
    );

    if (!hasNameHeader) {
        return { isValid: false, error: 'File does not appear to be a UKG schedule export (no "Name" column found).' };
    }

    return { isValid: true, error: null };
}

function splitIntoDailySchedules(rowData) {
    const dailySchedules = [];
    let currentRows = [];
    let currentDate = null;

    for (const row of rowData) {
        const cell = row[0];
        if (typeof cell === 'string') {
            const match = cell.match(/Date:\s*(\d{4}-\d{2}-\d{2})/);
            if (match) {
                if (currentRows.length && currentDate) {
                    dailySchedules.push({ date: currentDate, rows: currentRows });
                }
                currentDate = match[1];
                currentRows = [];
            }
        }
        currentRows.push(row);
    }

    if (currentRows.length && currentDate) {
        dailySchedules.push({ date: currentDate, rows: currentRows });
    }

    return dailySchedules;
}

/**
 * Row index where employee data begins — the row after the header row containing "Name".
 * Takes the LAST such match rather than the first: UKG exports can have an earlier
 * decorative "Dept/Job/Name" line before the real column-header row that also labels
 * the Shift/rest/meal columns.
 */
function findDataStart(rows) {
    let dataStart = 8;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && typeof row[2] === 'string' && row[2].trim().toLowerCase() === 'name') {
            dataStart = i + 1;
        }
    }
    return dataStart;
}

/** Locates the column labeled `label` (case-insensitive) in a header row, or -1 if absent. */
function findColumn(headerRow, label) {
    if (!headerRow) return -1;
    return headerRow.findIndex(cell => typeof cell === 'string' && cell.trim().toLowerCase() === label.toLowerCase());
}

/**
 * Walks a single day's rows into departments -> employees -> shift string. Mirrors
 * BreakScheduler.js's parseScheduleRows department/employee detection (col A = dept
 * header, col C = employee name) without computing breaks — this is a display-only
 * summary for the review screen.
 */
function extractDepartments(rows) {
    const dataStart = findDataStart(rows);
    const shiftCol = findColumn(rows[dataStart - 1], 'Shift');

    const departments = [];
    let current = null;

    for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;

        if (row[0] && !row[2]) {
            current = { name: String(row[0]).trim(), employees: [] };
            departments.push(current);
            continue;
        }

        if (!row[2] || !current) continue;

        current.employees.push({
            name: formatName(String(row[2])),
            job: row[1] ? String(row[1]).trim() : '',
            shift: shiftCol >= 0 && row[shiftCol] ? String(row[shiftCol]) : ''
        });
    }

    return departments;
}

/** Reformats "Last, First" to "First Last"; returns the original string otherwise. */
function formatName(name) {
    const parts = name.split(',').map(s => s.trim());
    return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
}
