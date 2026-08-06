# Design canonical schedule model + parser interface

Type: prototype
Status: resolved
Blocked by: 01
Context: prototype at `.scratch/saas-v1/prototypes/06-canonical-model/`

> **Constraint from [#05 IP-cut-line](05-draw-ip-protection-cut-line.md):** the parser runs **server-side**, and the canonical model is a **server-internal seam — NOT the API/wire contract** (the wire input is the raw file + preset id + settings; the client ships no parser and no `core/`). The pluggable-parser goal still holds server-side: the v1 variant is the **UKG preset** (B-preset), and the interface must leave room for interactive per-file mapping (B-map, v2) and future API parsers. Validation/rejection happens server-side, and unmatched files must be **rejected loudly**, never silently mis-parsed.

## Question

What is the canonical internal schedule model, and what is the parser interface that normalizes any input format into it?

This is the seam principle made concrete for ingestion. The core algorithm must consume only the canonical model — never a source format. The tabular parser (xlsx/CSV + column mapping, with a UKG preset) is v1's only parser, but the interface must let a JSON parser or API parser slot in later without touching the core.

Blocked by **Audit CA compliance completeness (#01)** because the canonical model's required fields are partly determined by what the compliance engine needs (e.g., does it need paid/unpaid segment markers, shift-type, meal-waiver eligibility inputs?).

Resolve via `/domain-modeling` + `/prototype`:
- The canonical shape: employee, date, start, end, department + whatever schedule-level metadata the algorithm and CA rules require (per #01).
- The parser interface: signature, how a parser reports mapping needs, how the tabular parser's column-mapping config is expressed and saved as a template, where the UKG preset lives.
- Validation: where malformed input is rejected and what the error contract is.

Deliverable: the canonical model definition + parser interface (stub/prototype), with the tabular parser sketched against it.

## Answer

**The seam is a flat `Segment[]`; all domain reasoning is behind it in `core/`.** Prototype: [`model.ts`](../prototypes/06-canonical-model/model.ts) (canonical model + parser interface) and [`ukg-parser.ts`](../prototypes/06-canonical-model/ukg-parser.ts) (v1 parser sketched against it).

### Framing correction discovered while resolving

`core/` was **not** decoupled from xlsx at all. `scheduleBreaks(rows, { dataStart, shiftColumnIndex })` took the **raw 2D sheet grid** and parsed it internally in `parseScheduleRows`, reading `row[0]`/`row[1]`/`row[2]` by position and stashing `rowIndex` on every segment for write-back; day-splitting sat outside `core/` in `ExcelFacade.splitIntoDailySchedules`. So this was not "add a type in front of core" but **cutting the parser out of `core/` and moving day-splitting in**.

Also established: the one format we know in detail (UKG Retail Schedule Planner) is **a report with positional state**, not a table — date comes from `Date: YYYY-MM-DD` delimiter rows, department from header rows carried down as walk state, shift as a string range in one cell, plus a junk column D. Per #02, the market's other archetype (Deputy, When I Work) *is* flat row-per-shift, and the dominant risk is **within-format column variance**, not format count.

### Canonical model

```
Segment {
  employeeId:   string   // REQUIRED, stable, from source
  employeeName: string   // display only — never a key
  workdayDate:  string   // YYYY-MM-DD, the CA §500 workday
  dept:         string
  job:          string
  start:        number    // minutes from workday start
  end:          number    // may exceed 1440; invariant: end > start
}
```

One record per source row. No nesting, **no provenance**.

**Moves into `core/`:** identity resolution, grouping into employee-days, workday partitioning, split-shift detection. **Deleted:** `parseScheduleRows`, the `rowIndex` parameter on `addSegment`, `ExcelFacade.splitIntoDailySchedules`, `deleteColumnD`.

### Decisions

1. **Parser depth — flat segments, core groups.** The parser flattens layout state away but does no domain reasoning. Rationale: mis-grouping is *compliance-relevant* (two people merged into one fabricates a split shift), and #01's B2 is already a split-shift-reasoning bug — so grouping gets **one audited home**. Under the alternative, every future parser re-implements grouping and would have to know what a CA workday is.

2. **Identity — a stable `employeeId` is required; a file without one is rejected.** Chosen over the recommended optional-id-with-collision-detection, as the stricter reading of #05's "reject loudly, never silently mis-parse." The hazard being closed: today identity **is the formatted name string**, so two "Alice Smith"s merge into one person with a gap → reads as a split shift → `gapSatisfiesMealPeriod()` **cancels a legally required meal**, and `totalWorkMinutes` double-counts, corrupting the break count. Carries an unconfirmed dependency — see #08.

3. **Time — day-anchored minutes; `end` may exceed 1440.** Fixes a live bug: `parseShiftInterval` has no wrap handling, so a 10PM–6AM shift yields `start=1320, end=360` → `totalWorkMinutes = −960` → `restBreaksRequired()` returns **0** and `mealsRequired()` returns **0**. **An overnight shift silently receives zero breaks.** Keeping the unit as minutes preserves every threshold in `core/` (285, 240, 300/600, the 15-min grid), honouring the map's "reused verbatim" constraint; absolute timestamps would have rewritten all of it and re-opened the #01 audit. v1 **flags** cross-midnight shifts as unsupported rather than applying §500 rules; v2 adds the rules with no model migration.

4. **Provenance — none; output is rendered fresh.** The server builds a row grid from canonical + results and runs the existing `SheetStyler`/`MultiDaySheetStyler` over it — they take `(sheet, rows)`, not the source workbook, so they survive. This removes `rowIndex` from `core/` entirely, lets the upload be discarded after parsing (B1-safe), kills the `deleteColumnD` hack, and gives free column layout for #01's 5 break slots. Enabling fact: today's output is **already** not a faithful copy of the upload, since `deleteColumnD` strips a column. Cost accepted: the customer's own extra columns and formatting are not carried through.

5. **Parser shape — one code module per source format.** `Parser { id, detect(wb) → confidence, parse(wb, opts) → outcome }`, resolved by a registry that rejects rather than best-guessing. No shared column-map abstraction: we know one format in detail, so this avoids designing a DSL from n=1. Consequences accepted: the UKG module carries its **own** header-synonym table (needed regardless, since UKG columns are admin-configurable), and **v2's B-map becomes a new parser** rather than a preset instance.

   > **Extended by [#10](10-set-per-request-size-ceiling.md):** a parser module also owns its **user-facing remediation copy**. #10's too-large-to-schedule message must tell the user how to re-export one location at a time, and that instruction is format-specific (for UKG it is the **Hyperfind** run parameter, per #08) — so remediation hints are preset-scoped, not generic, and each future parser supplies its own.

6. **Error contract — tiered, and a bad row poisons that employee's workday.**
   - *Fatal* (`FORMAT_UNRECOGNIZED`, `REQUIRED_COLUMN_MISSING`, `EMPLOYEE_ID_MISSING`) → reject the whole upload, produce nothing.
   - *Row-level*: a row recognised as an employee row but unparseable marks that **employee-day unschedulable and reports it**. Not merely excluded — dropping the row alone would leave their hour total short, silently changing the required break count. Other employees still process.
   - *Skipped by rule* (dept headers, blanks, date markers, unassigned/open shifts) → silent; skipping these is correct, not an anomaly.

   This replaces today's `if (start === 0 && end === 0) continue;`, which silently leaves an employee unscheduled.

### One structure that fell out

Three independent stages now produce the same kind of per-employee-day exception — #01's **`CANNOT_COMPLY`**, **`OVERNIGHT_UNSUPPORTED`**, and **`SOURCE_ROW_UNPARSEABLE`**. They share **one exception channel** and one output column, flowing in from the parser and being enriched by `core/`, rather than three ad-hoc paths.

Relatedly, `EmployeeDayResult.breaks` has **five named slots** (`rest1, meal1, rest2, meal2, rest3`). Today's four-slot model stuffs the second meal into `rest3` only when free, so a >10h shift — which always fills `rest3` with its third rest — silently loses it (#01 bug B1). Naming every slot makes that collision unrepresentable.

### Amendment (from [#09](09-define-compute-api-surface.md))

The model above **omits `location`**, and the prototype parser ignores the UKG `Location:` row. #09 found this is not cosmetic: coverage groups key on `dept`/`job`, so two stores that both have `Frontline/Cashier` collapse into **one coverage pool** and the optimizer staggers breaks between employees who never share a building. #07 and #10 both already assumed a `(location, workday)` partition that could not exist.

- **`Segment` gains `location: string`** — required and non-null. The parser always synthesizes a value, so `core/` partitions by `(location, workday)` with no null branch.
- **A document-level `locationSource: 'column' | 'document' | 'assumed'`** records where it came from: a per-row column; the report's `Location:` state row naming a single store (a real fact — Location is a UKG run parameter); or assumed, when the row is absent or says "All Home Locations".
- **`assumed` raises an advisory notice, not a rejection.** Unlike a missing `employeeId`, a merged pool degrades schedule *quality*, never legality — meal placement is bounded to its legal window before the optimizer sees it (`BreakScheduler.js:193-199`). Single-location customers must not be blocked by a column they have no reason to have.
- The parser's day-splitting/grouping responsibilities are unchanged; only the field set and the notice channel grow.

### Generated

- **#08** (research, blocking): confirm the UKG export can emit an employee-number column. If it cannot, decision 2's invariant returns as a fresh decision.
- **Fog:** the export tutorial (`ExportHelpStep.js`, `UkgMock.js`) must teach adding the id column.
- **Map correction:** the out-of-scope B-map line now reads as a new parser, not a preset reuse.
