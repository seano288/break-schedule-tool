/**
 * PROTOTYPE — design sketch for wayfinder ticket #06. Not production code.
 *
 * The v1 parser: UKG Retail Schedule Planner .xlsx/.csv export, sketched against
 * the seam in `model.ts` to prove the interface carries a real format.
 *
 * This format is the reason a declarative column map was rejected. It is a
 * REPORT WITH POSITIONAL STATE, not a table:
 *
 *   Date: 2024-01-15          <- delimiter row; date is not on the shift rows
 *   Location: Test Store
 *   Dept | Job | Name | Shift | ...   <- header row, ~row 8, position varies
 *   Cashier | | |                     <- dept header: col A set, name col empty
 *           | Cashier | Smith, Alice | 8:00AM-4:30PM
 *           | Cashier | Jones, Bob   | 9:00AM-3:00PM
 *   Clothing | | |                    <- dept changes
 *
 * Date and department are both carried down as walk state; the shift is a string
 * range inside a single cell. No column mapping can express any of that.
 */

import type {
    DetectResult, EmployeeDayException, Parser, ParseOptions, ParseOutcome,
    Segment, SourceWorkbook, WorkdayMinutes,
} from './model';

/**
 * Within-format column variance is the real risk (UKG's export columns are
 * admin-configurable via CSV_Export_Column_Names_Order), so this parser resolves
 * columns by header synonym rather than by fixed index. Owning this table
 * locally is the cost of having no shared abstraction — accepted deliberately.
 */
const HEADERS = {
    employeeId: ['person number', 'employee number', 'employee id', 'badge', 'badge number'],
    name:       ['name', 'employee name', 'employee'],
    shift:      ['shift', 'scheduled shift', 'shift time'],
    job:        ['job', 'job title', 'role'],
    dept:       ['dept', 'department', 'location'],
} as const;

const DATE_MARKER = /Date:\s*(\d{4}-\d{2}-\d{2})/;

export const ukgSchedulePlannerParser: Parser = {
    id: 'ukg-retail-schedule-planner',

    detect(input: SourceWorkbook): DetectResult {
        const rows = input.sheets[0]?.rows ?? [];
        const head = rows.slice(0, 15);
        const hasNameHeader = head.some(r => r.some(c => isHeader(c, HEADERS.name)));
        const hasDateMarker = head.some(r => DATE_MARKER.test(String(r[0] ?? '')));
        // Both signals = confident. One = plausible but let a better parser win.
        return { confidence: hasNameHeader && hasDateMarker ? 0.9 : hasNameHeader ? 0.4 : 0 };
    },

    parse(input: SourceWorkbook, _opts: ParseOptions): ParseOutcome {
        const rows = input.sheets[0]?.rows ?? [];

        const headerRow = rows.findIndex(r => r.some(c => isHeader(c, HEADERS.name)));
        if (headerRow === -1) {
            return { ok: false, code: 'FORMAT_UNRECOGNIZED', detail: 'No recognisable header row found.' };
        }

        const col = resolveColumns(rows[headerRow]);

        // Identity is non-negotiable: without it, same-named employees merge into
        // a fabricated split shift that can cancel a required meal.
        if (col.employeeId === undefined) {
            return {
                ok: false,
                code: 'EMPLOYEE_ID_MISSING',
                detail: 'This export has no employee-number column. Re-run the UKG report with '
                    + 'an employee identifier column included.',
            };
        }
        if (col.name === undefined || col.shift === undefined) {
            return { ok: false, code: 'REQUIRED_COLUMN_MISSING', detail: 'Export is missing a Name or Shift column.' };
        }

        const segments: Segment[] = [];
        const exceptions: EmployeeDayException[] = [];
        let currentDate: string | null = null;
        let currentDept = '';

        for (let i = headerRow + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;

            // --- Walk state: date delimiter ---
            const marker = DATE_MARKER.exec(String(row[0] ?? ''));
            if (marker) {
                currentDate = marker[1];
                continue;
            }

            // --- Walk state: department header (col A set, name cell empty) ---
            if (row[0] && !row[col.name]) {
                currentDept = String(row[0]).trim();
                continue;
            }

            // --- Skipped by rule: blanks, totals, unassigned/open shifts. Silent. ---
            const rawName = row[col.name];
            if (!rawName) continue;

            const employeeId = String(row[col.employeeId] ?? '').trim();
            const employeeName = formatName(String(rawName));

            // A row with a name but no id is a data problem, not a rule skip.
            if (!employeeId || !currentDate) {
                exceptions.push({
                    employeeId: employeeId || `unresolved:${employeeName}`,
                    workdayDate: currentDate ?? 'unknown',
                    code: 'SOURCE_ROW_UNPARSEABLE',
                    detail: !currentDate
                        ? `Row ${i + 1} appears before any Date: marker.`
                        : `Row ${i + 1} has a name but no employee number.`,
                });
                continue;
            }

            const interval = parseShiftInterval(String(row[col.shift] ?? ''));
            if (!interval) {
                // Poison the whole employee-day. Dropping just this row would leave
                // their hour total short, which silently changes the required break
                // count — a clean-looking, legally wrong answer.
                exceptions.push({
                    employeeId,
                    workdayDate: currentDate,
                    code: 'SOURCE_ROW_UNPARSEABLE',
                    detail: `Row ${i + 1}: could not read shift "${String(row[col.shift] ?? '')}".`,
                });
                continue;
            }

            segments.push({
                employeeId,
                employeeName,
                workdayDate: currentDate,
                dept: currentDept,
                job: col.job !== undefined ? String(row[col.job] ?? '').trim() : '',
                start: interval.start,
                end: interval.end,
            });
        }

        return { ok: true, segments, exceptions };
    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isHeader(cell: unknown, synonyms: ReadonlyArray<string>): boolean {
    return typeof cell === 'string' && synonyms.includes(cell.trim().toLowerCase());
}

function resolveColumns(header: ReadonlyArray<unknown>): Partial<Record<keyof typeof HEADERS, number>> {
    const out: Partial<Record<keyof typeof HEADERS, number>> = {};
    for (const [role, synonyms] of Object.entries(HEADERS) as Array<[keyof typeof HEADERS, ReadonlyArray<string>]>) {
        const idx = header.findIndex(c => isHeader(c, synonyms));
        if (idx !== -1) out[role] = idx;
    }
    return out;
}

/**
 * "8:00AM-4:30PM" -> workday minutes.
 *
 * Returns null rather than a sentinel: today's `parseShiftInterval` returns
 * [0, 0] on failure, which the caller then skips silently.
 *
 * A shift whose end reads earlier than its start crosses midnight, so the end is
 * carried into the next day (`+1440`) to preserve the `end > start` invariant.
 * The parser only REPRESENTS this faithfully — deciding that v1 will not apply
 * § 500 cross-midnight rules is `core/`'s call, made by observing `end > 1440`.
 */
function parseShiftInterval(raw: string): { start: WorkdayMinutes; end: WorkdayMinutes } | null {
    const parts = raw.split('-');
    if (parts.length !== 2) return null;

    const start = timeToMinutes(parts[0]);
    let end = timeToMinutes(parts[1]);
    if (start === null || end === null) return null;

    if (end <= start) end += 1440;
    return { start, end };
}

/** Null on unparseable input, so failures are distinguishable from midnight. */
function timeToMinutes(raw: string): number | null {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(raw.trim());
    if (!m) return null;
    const minute = Number(m[2]);
    if (minute > 59) return null;
    let hour = Number(m[1]);
    if (m[3]) {
        if (hour < 1 || hour > 12) return null;
        hour = hour % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
    } else if (hour > 23) return null;
    return hour * 60 + minute;
}

/** "Smith, Alice" -> "Alice Smith". Display only; never an identity key. */
function formatName(raw: string): string {
    const parts = raw.split(',').map(s => s.trim());
    return parts.length === 2 ? `${parts[1]} ${parts[0]}` : raw.trim();
}
