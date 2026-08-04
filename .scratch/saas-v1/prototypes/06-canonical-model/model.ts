/**
 * PROTOTYPE — design sketch for wayfinder ticket #06. Not production code.
 * Types only; expressed in TS because the point of the artifact is the contract.
 *
 * The ingestion seam for the break-scheduling SaaS. Everything upstream of
 * `Segment[]` is per-format parser code. Everything downstream is `core/`, which
 * must never see a source format.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

/**
 * Minutes elapsed from the start of the workday.
 *
 * NOT minutes-since-midnight. May exceed 1440 so a cross-midnight shift stays
 * expressible: 10PM–6AM is { start: 1320, end: 1800 }, which yields a correct
 * 480-minute duration. The current implementation's minutes-since-midnight
 * representation produces end < start here, and therefore a NEGATIVE duration,
 * which silently collapses to zero required breaks.
 *
 * Keeping the unit as minutes is deliberate: every threshold in `core/`
 * (MAX_WORK_BEFORE_MEAL = 285, the 240-minute rest period, the 300/600 meal
 * triggers, the 15-minute placement grid) keeps working unchanged.
 */
export type WorkdayMinutes = number;

/**
 * ISO calendar date, `YYYY-MM-DD`, identifying the CA workday the segment
 * belongs to. Cal. Lab. Code § 500 defines a workday as a fixed 24-hour period,
 * so this is the unit compliance is evaluated over — not the calendar day a
 * clock time happens to fall in.
 */
export type WorkdayDate = string;

// ── The seam ──────────────────────────────────────────────────────────────────

/**
 * One scheduled work segment for one employee on one workday.
 *
 * Flat and unnested by design: a parser emits one of these per source row and
 * does no domain reasoning. Grouping into employee-days, workday partitioning,
 * and split-shift detection are compliance-relevant and belong to `core/`, in
 * one audited place.
 *
 * Carries no provenance. Output is rendered fresh from the canonical model
 * rather than written back into the uploaded workbook, so `core/` has no
 * `rowIndex` and the upload can be discarded after parsing (B1: transient data).
 */
export interface Segment {
    /**
     * Stable identifier from the source. REQUIRED — a file without one is
     * rejected outright (see `FatalCode.EMPLOYEE_ID_MISSING`).
     *
     * Names cannot serve as identity: two employees sharing a name merge into
     * one person with a gap between their shifts, which reads as a split shift,
     * which lets `gapSatisfiesMealPeriod()` cancel a legally required meal. It
     * also double-counts total hours and so corrupts the break count.
     */
    employeeId: string;

    /** Display only — printed in the output. Never a grouping key. */
    employeeName: string;

    workdayDate: WorkdayDate;

    /** Main department. */
    dept: string;

    /** Sub-department / job title. */
    job: string;

    start: WorkdayMinutes;

    /** Invariant: `end > start`. A parser that cannot satisfy this must emit an exception instead. */
    end: WorkdayMinutes;
}

// ── The exception channel ─────────────────────────────────────────────────────

/**
 * Three independent stages produce per-employee-day exceptions, so they share
 * one channel and one output column rather than three ad-hoc paths.
 */
export type ExceptionCode =
    /** Parser: a row recognised as an employee row could not be read. */
    | 'SOURCE_ROW_UNPARSEABLE'
    /** Core: the shift crosses midnight; v1 does not apply § 500 cross-midnight rules. */
    | 'OVERNIGHT_UNSUPPORTED'
    /** Core: no compliant break placement exists (audit #01 must-handle item 3). */
    | 'CANNOT_COMPLY';

/**
 * An employee-day the tool declines to schedule, and why.
 *
 * The governing rule for all three producers: never emit a clean-looking result
 * that is quietly wrong. A poisoned employee-day is reported and excluded, not
 * scheduled from partial data.
 */
export interface EmployeeDayException {
    employeeId: string;
    workdayDate: WorkdayDate;
    code: ExceptionCode;
    /** Human-readable, surfaced to the manager. */
    detail: string;
}

// ── Parser interface ──────────────────────────────────────────────────────────

/** Opaque handle to the uploaded file. Parsed server-side, never persisted (B1). */
export interface SourceWorkbook {
    filename: string;
    sheets: ReadonlyArray<{ name: string; rows: ReadonlyArray<ReadonlyArray<unknown>> }>;
}

/** Fatal: nothing is processed and no output is produced. */
export type FatalCode =
    /** No registered parser claimed the file with sufficient confidence. */
    | 'FORMAT_UNRECOGNIZED'
    /** The format was recognised but a column the parser needs is absent. */
    | 'REQUIRED_COLUMN_MISSING'
    /** No employee-identifier column — identity would be ambiguous. */
    | 'EMPLOYEE_ID_MISSING';

export interface ParseRejection {
    ok: false;
    code: FatalCode;
    detail: string;
}

export interface ParseSuccess {
    ok: true;
    segments: Segment[];
    /**
     * Row-level failures only. Rows skipped BY RULE — department headers, blank
     * rows, date markers, unassigned/open shifts — are not reported; skipping
     * them is correct behaviour, not an anomaly.
     */
    exceptions: EmployeeDayException[];
}

export type ParseOutcome = ParseSuccess | ParseRejection;

export interface DetectResult {
    /** 0–1. The registry picks the highest scorer above its threshold. */
    confidence: number;
}

/**
 * One implementation per source format. There is deliberately no shared
 * column-map abstraction: we know exactly one format in detail, so each parser
 * is free to be as weird as its source is, and handles within-format column
 * variance (UKG's columns are admin-configurable) with its own header-synonym
 * resolution.
 */
export interface Parser {
    readonly id: string;

    /**
     * Cheap structural check. Must not throw on hostile input.
     * Returning a low confidence is how a parser declines a file.
     */
    detect(input: SourceWorkbook): DetectResult;

    parse(input: SourceWorkbook, opts: ParseOptions): ParseOutcome;
}

export interface ParseOptions {
    /**
     * Fallback when the source expresses no timezone. Only affects how a
     * workday boundary is resolved, never the minute arithmetic.
     */
    timezone: string;
}

/**
 * Resolves a workbook to a parser, or rejects loudly. An unmatched file is
 * never passed to a best-guess parser (#05: no silent mis-parsing).
 */
export interface ParserRegistry {
    register(parser: Parser): void;
    select(input: SourceWorkbook): Parser | ParseRejection;
}

// ── What core/ consumes and returns ───────────────────────────────────────────

/**
 * `core/`'s only entry point. Replaces today's
 * `scheduleBreaks(rows, { dataStart, shiftColumnIndex })`, which took the raw
 * sheet grid and parsed it internally.
 */
export declare function scheduleBreaks(
    segments: ReadonlyArray<Segment>,
    settings: SchedulerSettings,
    /** Carried in from the parser so one channel holds every exception. */
    inbound: ReadonlyArray<EmployeeDayException>
): ScheduleResult;

export interface ScheduleResult {
    days: EmployeeDayResult[];
    /** Inbound parser exceptions plus those core adds (OVERNIGHT_UNSUPPORTED, CANNOT_COMPLY). */
    exceptions: EmployeeDayException[];
}

export interface EmployeeDayResult {
    employeeId: string;
    employeeName: string;
    workdayDate: WorkdayDate;
    dept: string;
    job: string;
    /**
     * Five named slots. Today's model has four (`rest1, meal, rest2, rest3`) and
     * stuffs the second meal into `rest3` only when it is free — so a >10h shift,
     * which always fills `rest3` with its third rest, silently loses the second
     * meal (audit #01, bug B1). Naming every slot makes that class of collision
     * unrepresentable.
     */
    breaks: {
        rest1: WorkdayMinutes | null;
        meal1: WorkdayMinutes | null;
        rest2: WorkdayMinutes | null;
        meal2: WorkdayMinutes | null;
        rest3: WorkdayMinutes | null;
    };
    /** False when an exception exists for this employee-day; breaks are then not authoritative. */
    schedulable: boolean;
}

export interface SchedulerSettings {
    operatingHours: { startTime: WorkdayMinutes; endTime: WorkdayMinutes };
    groups: ReadonlyArray<{ id: number; name: string; departments: Array<{ main: string; sub: string }> }>;
    advanced: {
        maxEarly: number;
        maxDelay: number;
        deptCoverageMode: 'individual' | 'balanced' | 'group';
        timeCoverageMode: 'predictable' | 'balanced' | 'coverage';
        idealMealOffset: number;
    };
}
