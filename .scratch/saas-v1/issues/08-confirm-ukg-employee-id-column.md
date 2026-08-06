# Confirm the UKG export can emit an employee-id column

Type: research
Status: resolved
Context: findings at `.scratch/saas-v1/research/08-ukg-employee-id-column.md`

> **Raised by [#06 canonical model + parser interface](06-design-canonical-model-and-parser-interface.md).** That ticket made a stable `employeeId` a **required** field of the canonical model, and a file without one is rejected outright — because name-keyed identity lets two same-named employees merge into one fabricated split shift, which can cancel a legally required meal. This ticket verifies that requirement is actually satisfiable.

## Question

Can the **UKG Retail Schedule Planner** schedule export (the `.xlsx`/`.csv` our v1 preset targets) include a per-employee stable identifier column — employee number, person number, badge, or equivalent? If so, is it available by default, or must a customer admin add it to the report configuration?

**Why this blocks:** if the answer is no, the required-id invariant rejects **100% of our anchor format** and v1 can ingest nothing. This is a v1-fatal dependency currently resting on an unconfirmed fact.

What #02 established, and what it did not: UKG's **CSV report** column order/names are admin-configurable (`CSV_Export_Column_Names_Order`), and Schedule Planner also emits `.xlsx`. But #02 explicitly marks per-report **column inventories** as unconfirmable from public pages, and the schedule export is a different flow from the report export it documented. So configurability is established; *availability of an identifier field* is not.

Resolve against primary sources (UKG community/KOL online help, developer portal):

- Does the Schedule Planner schedule export expose an employee-identifier field at all?
- Default-on, or admin-configurable? What permission or function-access level is needed to add it?
- Does it differ between the `.xlsx` and `.csv`/delimited output paths?
- Secondary, for the same reason: do **Deputy** and **When I Work** exports carry a user/employee id? (#02 names these as the next parsers; both are documented as one-row-per-shift.)

## Answers that change the route

- **Available by default** → decision 2 of #06 stands unchanged; only the export tutorial needs a verification step.
- **Admin-configurable only** → invariant stands, but onboarding grows a hard prerequisite and the export tutorial (`ExportHelpStep.js`, `UkgMock.js`) must teach adding the column. Consider what happens for a customer whose admin won't.
- **Not available** → #06 decision 2 is reopened as a fresh decision; the fallback previously considered was name-keying plus hard collision detection (overlapping segments under one name are physically impossible, so they are a free, reliable signal).

## Answer

**"Admin-configurable only" holds — high confidence.** Findings: [`research/08-ukg-employee-id-column.md`](../research/08-ukg-employee-id-column.md).

**First, the premise was wrong.** The anchor is **not** a Schedule Planner export. Our own tutorial — built against a live tenant — walks *Main Menu → Dataviews & Reports → **Report Library** → Run Report → **Custom Reports** → **Custom Daily Schedule** → Output Format = XLSX* (`UkgMock.js` `TUTORIAL_STEPS`), which matches UKG's documented Report Library flow. So the anchor file is a **customer-authored custom BIRT report**, and its column inventory is *by construction* defined by the customer's own report design. There is no fixed UKG schema to confirm or deny — which is why #02 could never have closed this from public pages.

**Not "available by default."** The real file has five columns and no id: A = dept band header, B = job, C = employee name, D = shift label (deleted before parsing), E = shift interval string — confirmed from the shipped parser (`core/constants.js` `COL`, `BreakScheduler.parseScheduleRows` keying identity on `formatName(row[2])`, `ExcelFacade.deleteColumnD`). Every UKG-*delivered* schedule-shaped report is name-only too: *Location Schedule Detail - Weekly* (Employee / Scheduled Job / Dates) and *Staffing Sheet Daily* (Location / Span / Job / Employee / Start–End / Planned / Variance). **The anchor tenant's export would be rejected by #06's invariant today.**

**Not "not available."** The identifier exists at every layer: `personIdentity` carrying "person and badge numbers", `personKey` = "person key or employee ID", and a distinct user-supplied `personNumber` (developer portal); `schedule/multi_read` returns employees as `id` + `qualifier` (the person number) with segment `startDateTime`/`endDateTime`; the Dataview column library explicitly names **Employee ID** and **Badge number**; and a UKG-delivered scheduler report renders it in a column — *Good Faith Estimate - Employment Terms* "Displays the employee's name, and their **Employee ID**, Primary Job, Birth Date, Hire Date, and Worker Type."

**Why "admin", not "manager" — UKG says it in one sentence.** Users can show/hide and re-sequence columns, but "any changes will not be applied the next time they run a report. Persistent changes for reports can be achieved by the **Administrator in report studio** as part of the Report design process" (Reports–Dataviews comparison). Corroborated twice: the run dialog's only parameters are **Timeframe / Hyperfind / Output Format** — no column picker (matching our mock exactly); and `CSV_Export_Column_Names_Order` controls "the **order** defined by your administrator", i.e. order, not membership. **This closes #02's open question restrictively.** Adding the column = an admin opens the design in **Report Studio** (*Administration → Application Setup → Common Setup → Published Reports → Create Design*), adds the field via the **Table Builder** wizard, republishes, and re-assigns the Report Data Access Profile — all requiring Application Setup access. Worst-case tail: if the underlying **report data object** lacks the field, UKG's docs (for Healthcare Productivity custom reports; scope elsewhere unconfirmed) require "a Salesforce Service Request to UKG" to get an RDO.

**`.xlsx` vs `.csv`:** no difference in *identifier availability* — both render whatever the design retrieves. But Excel "has exactly the same layout as the HTML page" while delimited output is **data-only with no layout**, so (inferred, needs a sample) the `.csv` of the same report likely arrives **flattened** — no dept band rows, no spacer column D — i.e. plausibly a *second* parser under #06's one-module-per-format rule, not a switch.

**Consequences beyond the ticket's stated branch:**
1. The prerequisite is **heavier than a tutorial step and lands on a different person** — a report re-design by a UKG admin, i.e. an internal IT/HR ticket with lead time (possibly a UKG SR). It is an implementation/pre-sales task; the tutorial's job shrinks to **verifying** the column and **naming the ask precisely**.
2. `map.md`'s onboarding item should be **re-pointed off "Schedule Planner"** onto the Report Library/custom-report flow. `ExportHelpStep.js`'s existing "Manager or admin access required" callout is where the stronger prerequisite hangs.
3. The #06 prototype's rejection copy ("Re-run the UKG report with an employee identifier column included") **asks the manager to do something they cannot** and will read as our bug. It must name the report, the field, and the role.
4. **Unanticipated:** "the customer whose admin won't" is not hypothetical — **our own anchor customer is in that state right now.** #06 decision 2 is not reopened, but the name-keying + hard-collision-detection fallback is now a route for a *present, real* customer, and the shipped tool is exposed to exactly the merge-two-same-named-employees failure #06 cited. Worth an explicit decision.
5. **Escape hatch, unproven:** a **Dataview** needs no admin — manager-selectable columns including *Employee ID*, persisted by saving the Dataview, exported via Share → Export (**CSV only**). But whether any Dataview can emit **one row per shift segment with start/end times** is **unconfirmed** — the only documented granularity is aggregate ("one row per location/job per day"). Candidate second parser to validate against a real file; not a promise.

**Secondary (Deputy / When I Work): the same pattern, worse.** Neither vendor's schedule-export help page enumerates *any* column, so both inventories are **unconfirmed** — while both document an id on every *other* export (Deputy's People bulk export carries `Deputy ID` + `Payroll ID`; its timesheet export carries `Employee Export Code`; WIW's Users *and* Timesheets exports both list "employee ID"). Three vendors, three schedule exports, zero published column lists → **no vendor's schedule-export columns are resolvable from docs, only from a sample file**, which vindicates #06's loud-rejection posture. Two new hazards: (a) Deputy's own shift-grain spreadsheet interchange format has **no id column at all** and matches "**on the email address**" — so email is a live third identity strategy; (b) where an id *is* offered it is often the **optional, employer-populated** one (Deputy `Payroll ID`, WIW `employee_code`), so a column can be **present and blank** — #06's invariant must treat a blank cell in a present id column as `SOURCE_ROW_UNPARSEABLE`, not as a valid empty key (the prototype does; record it as deliberate). All three APIs *do* carry a stable shift-level id (UKG `id`+`qualifier`, Deputy `Roster.Employee`, WIW `Shift.user_id`) — a second justification for #02's "UKG Pro WFM API first": **the API is the only ingestion path where identity is guaranteed rather than negotiated.**

**Preset header synonyms to widen to:** `Person Number`, `Employee ID`, `Employee Number`, `Badge`, `Badge Number`, and bare `ID` (what People Information and employee search call it — but generic, so match only within an already-matched format).

**Explicitly unconfirmable from public pages** (7 items enumerated in the findings), notably: UKG publishes **no** column inventory for Schedule Planner column sets, Dataviews, or any RDO; whether the Dataview's "Employee ID" is `personNumber` or `personKey`; the exact Pro WFM function-access control point for Report Studio (only the legacy WFC one is documented); and whether the anchor tenant's custom report is customer-editable at all versus UKG-Professional-Services-delivered — **ask the design partner.**
