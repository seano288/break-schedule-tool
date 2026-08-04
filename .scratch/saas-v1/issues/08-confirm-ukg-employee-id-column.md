# Confirm the UKG export can emit an employee-id column

Type: research
Status: open

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
