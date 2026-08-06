# Can the UKG export emit a per-employee stable identifier column?

**Ticket:** Research — [#08](../issues/08-confirm-ukg-employee-id-column.md). #06 made `employeeId` a **required** field of the canonical model and rejects any file without one. Is that requirement satisfiable against our anchor format?
**Date:** 2026-08-05
**Context:** v1's anchor ingestion format is the `.xlsx` a manager runs out of **UKG Pro WFM** (Dimensions). [#02](02-integrations-landscape.md) confirmed the export formats and that CSV column *order* is admin-configurable, but explicitly marked per-report **column inventories** as unconfirmable from public pages. This ticket closes that gap.

Scope note: findings are drawn from UKG's own KOL online help (`communityfiles.ukg.com`, `customer2.kronos.com`), the UKG product library (`library.ukg.com`), and the UKG developer portal (`developer.ukg.com`) — plus a second class of primary source available only to us: **the working tool in this repo**, which was built by clicking through a real UKG tenant and parsing the real file. Where a fact could not be confirmed from a primary source it is marked **unconfirmed** rather than inferred; where I reason past the sources, the step is labelled **inferred**.

---

## Finding 0 — the ticket's premise needs correcting first

The ticket (inheriting the framing from `map.md`) calls the anchor a "**UKG Retail Schedule Planner** schedule export". **It is not.** Our own export tutorial — built screen-by-screen against a live tenant — walks a completely different flow:

> Main Menu → hamburger → **Dataviews & Reports** → **Report Library** → **Run Report** → *Select Report* panel → **Custom Reports** → **Custom Daily Schedule** → Select → set **Timeframe** + **Location** + **Output Format = XLSX** → **Run Report** → "Report is completed" → Ok → download.
> — [`src/wizard/UkgMock.js`](../../../src/wizard/UkgMock.js) `TUTORIAL_STEPS`, and its sibling entry in the same panel, `Store Weekly Schedule by Employee`

That flow matches UKG's own documented Report Library flow exactly ("From the Report Library, click/tap Run Report… In the Select Report panel, select a category… Select a report… Enter the applicable report parameters… Run Report"). [Source](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/Reports/RunReports.htm)

So the anchor file is **a customer-authored custom BIRT report living in the Report Library's `Custom Reports` category** — not a Schedule Planner grid export, and not a UKG-delivered standard report. Everything below follows from that, and it is the single most decision-relevant fact in this document: **the column inventory of our anchor format is, by construction, defined by the customer's own report design.** There is no fixed UKG schema to confirm or deny.

---

## Finding 1 — Confirmed: nobody can add a column at export time

Three independent primary sources agree that the person *running* the export has no lever over which columns exist.

**The run dialog exposes three parameters and no column picker.** UKG documents the run parameters as **Timeframe**, **Hyperfind** (locations), and **Output format** — the documented output formats being PDF, Excel, Interactive, and CSV. Nothing about column selection. [Source](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/Reports/RunReports.htm) — and our tutorial's render of the real panel shows exactly those three fields (`Timeframe*`, `Location*`, `Output Format*`) plus a read-only `Description`. [Source](../../../src/wizard/UkgMock.js)

**`CSV_Export_Column_Names_Order` reorders; it does not add.** #02 correctly found this setting but the wording bounds it tightly: "The report provides the columns **in the order** defined by your administrator (in the `CSV_Export_Column_Names_Order` parameter)", alongside "The report always includes the column headers as the first row." [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/CSV_output.htm) → **This closes #02's open question in the restrictive direction:** configurability of *order* is not configurability of *membership*.

**Interactive show/hide exists but is per-session and can only reveal columns the design already retrieves.** UKG's own Reports-vs-Dataviews comparison: "Both Dataviews and interactive reports enable all users to show or hide columns, as well as re-sequence columns" — but "any changes will not be applied the next time they run a report. **Persistent changes for reports can be achieved by the Administrator in report studio as part of the Report design process.**" [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/DataView-ReportComparison.htm)

That last quote is the answer to the ticket in one sentence, from UKG's mouth.

---

## Finding 2 — Confirmed: an admin *can* add it, in Report Studio

**Report Studio** is UKG's in-tenant, web-based report designer. Menu path: **Main Menu → Administration → Application Setup → Common Setup → Published Reports → Create Design**. Reports draw their fields from a **report data object (RDO)** — "a collection of business objects defined in the application that can be used to create reports" — managed at *Common Setup → Report Data Object Management*. Dropping a table element into the layout pane opens the **Table Builder** wizard, "enabling you to select and arrange the data fields to use in the table"; "Report Studio displays the data columns in the order in which you select them." [Source](https://customer2.kronos.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/ApplicationSetup/Reports/AdministerReports.htm) — *caveat: this KOL page is indexed and its text is retrievable through search, but returns HTTP 404 to a direct fetch; treat the quotes as verified-by-index, not verified-by-fetch.*

So "add an employee-number column to the Custom Daily Schedule report" is a **report-design edit**: open the design in Report Studio, add the identifier data field in Table Builder, republish.

**It is gated on administrator permissions, not manager permissions.** Publishing a report requires "access to Application Setup", and after publishing "you must add it to a Report Data Access Profile and assign it in a manager's People Information record." [Source](https://customer2.kronos.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/PublishReports.htm) On the legacy **Workforce Central 8.1** platform the same capability was gated on an explicit control point — "Function Access Profile under *Workforce Manager - Department Manager > Reports > Report Setup > Report Setup Access*", plus write access to the `OtherReports2008` directory and `.rptdesign` upload. [Source](https://communityfiles.ukg.com/support/KOL/onlinehelp81/Subsystems/Help-SAG/Content/wfc_sag/Reports.htm) *This is WFC, not Pro WFM — cited to show the shape of the gate, not as the current control point. The exact Pro WFM function-access control point for Report Studio is **unconfirmed** from public pages.*

**One escalation path exists and may bite.** If the report's underlying RDO does not expose the field you need, UKG's documentation for custom reports says: "To request the report data object (RDO) for custom reports, you must submit a **Salesforce Service Request to UKG**. After the RDOs are delivered to your tenant, you can edit them as required." [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardReports/HealthcareProductivity/ReportsHCPCustom.htm) — **scope caveat:** this page documents *Healthcare Productivity* custom reports. Whether the same UKG-ticket dependency applies to scheduling-domain RDOs is **unconfirmed**. It is the worst-case tail: not "admin can't", but "admin has to open a vendor ticket first".

---

## Finding 3 — Confirmed: UKG carries stable per-person identifiers, and its reporting layer surfaces them

The identifier exists at every layer, under several names. Getting the names right matters, because the parser resolves columns by header synonym.

**In the data model / API.** `personIdentity` "contains properties and objects that define the core identifying elements of a person, including **person and badge numbers**". `personKey` is "a system-generated ID, known as a **person key or employee ID**". `personNumber` is a separate, user-supplied business number (examples in the docs: `20190`, `30197`). The docs are explicit that these are different things: "A person's person ID is the same as the personKey and employee ID, and is **not** the same as the person number." [Source](https://developer.ukg.com/wfm/docs/a-guide-to-people-information-doc)

**In the schedule API.** `POST /api/v1/scheduling/schedule/multi_read` returns `shifts` whose employee references carry `"id"` **and** `"qualifier"` (e.g. `"id": 54, "qualifier": "20108"` — the qualifier being the person number), and shift `segments` carrying `startDateTime` / `endDateTime`. [Source](https://developer.ukg.com/wfm/docs/retrieve-employee-details-and-view-schedules-doc) *Relevant to the post-v1 UKG API parser #02 recommended: the API route has no identity problem at all.*

**In the People record UI.** People Information's Employee section documents an "**ID** — The employee's ID" field. [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/PeopleInfo/Employee.htm) Employee search is "Search by **Employee Name or ID** field". [Source](https://library.ukg.com/docs/en-us/UKG_Dimensions/Platform/Information_Access/Search_for_Employee/Use_EE_Search.html)

**In the Dataview column library.** UKG's Dataview personalization page names, among available columns, "**Employee ID**" and "**Badge number**" (alongside "Primary Labor Account", "Primary Job", "Org Name"). [Source](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/content/dataviews/PersonalizeData.htm)

**In a UKG-*delivered* scheduler report.** The strongest single confirmation that the reporting layer can render an identifier next to schedule data: the **Good Faith Estimate - Employment Terms** report "Displays the employee's name, and their **Employee ID**, Primary Job, Birth Date, Hire Date, and Worker Type." [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardReports/Scheduler/GoodFaithEstimateEmploymentTerms.htm) The **Employee Schedule - Weekly** report also surfaces it, though only in a totals edge case: "If applicable, the total number of employees who are not totalized also appears as well as the employee's name (last, first) **and ID**" — its main body is Employee / Job / Shifts (by start and end time) / Paycodes. [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardReports/Scheduler/EmployeeSchedule.htm)

**Inferred (strongly supported, not stated):** because a delivered scheduler-domain report renders `Employee ID`, the scheduling RDO exposes a person identifier, and therefore a Report Studio edit can add it to a custom daily schedule report without a UKG service request. I could not find a page that says this outright.

---

## Finding 4 — Confirmed: name-only is the *default* for every schedule-shaped report, including ours

This is the half of the answer that rules out "available by default".

**UKG's delivered schedule reports identify employees by name.** *Location Schedule Detail - Weekly* has three columns — **Employee** / **Scheduled Job** / **Dates** — and the Employee column is names only, with full-name-vs-short-name offered as a run parameter; no identifier column. [Source](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/Reports/StandardReports/Scheduler/LocationScheduleDetailWeekly.htm) *Staffing Sheet Daily* — the closest delivered analogue to our anchor, one row per employee shift for a single day — lists **Location / Span / Job / Employee / Start Time - End Time / Planned / Variance**, with no identifier. [Source](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/Reports/StandardReports/Scheduler/StaffingSheetDaily.htm)

**Our actual anchor file has no identifier column.** The shipped tool's parser is positional, and its positions are the ground truth on the real file: column **A** = department band header (a row where col A is set and the name cell is empty), **B** = job/sub-department, **C** = employee name, **D** = a shift-label column that is *deleted before parsing*, **E** = the shift interval string, with data starting around row 7.
- `COL = { DEPT: 0, JOB: 1, NAME: 2, SHIFT: 3, … }`, commented "Column indices in the schedule data **after column D is removed**" — [`src/core/constants.js:83`](../../../src/core/constants.js)
- `parseScheduleRows` keys identity on `formatName(String(row[2]))` — the name — and there is no id read anywhere. [`src/core/BreakScheduler.js:16`](../../../src/core/BreakScheduler.js)
- `deleteColumnD` — "Column D in UKG exports is a shift-label column that we don't need." [`src/facades/ExcelFacade.js:101`](../../../src/facades/ExcelFacade.js)

Five columns, none of them an id. **The anchor tenant's report, as configured today, would be rejected by #06's invariant.** That is the concrete cost this ticket was raised to price.

*(Also worth recording: the banded-header, blank-column-D, seven-header-row shape is not sloppiness — it is a faithful Excel render of a BIRT report's grouped layout. See Finding 5.)*

---

## Finding 5 — Confirmed: xlsx vs. csv changes layout fidelity, not column availability

The ticket asked whether the two output paths differ. They do, materially — but not on the question at hand.

- **Excel is a layout-preserving render.** "The exported content in any version of Excel has exactly the same layout as the HTML page." Formats for report *content*: Excel (.xls/.xlsx), PDF, PostScript, Word, PowerPoint, XHTML. [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/ExportReports.htm)
- **Delimited output is data-only.** Comma/pipe/tab/semicolon-separated; "you cannot export a table or chart element, but you can export the data displayed in both these elements", with optional **Export Column Header** and **Export Column Data Type** settings. [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/ExportReports.htm)

**Answer: no difference in whether an identifier is available** — both render whatever the report design retrieves. **Inferred, and worth flagging to #06:** because the delimited path is data-only and does not preserve layout, the `.csv` of *the same report* very likely arrives **flattened** — no department band rows, no blank spacer column, no title block — i.e. a genuinely different parse problem from the `.xlsx`. #06 decided "one code module per format"; on this evidence `ukg-xlsx` and `ukg-csv` may be two formats, not one parser with a switch. Not confirmed; would need a sample.

Also confirmed, and cutting against the Dataview alternative: **Dataviews export CSV only.** "Dataviews: HTML, CSV" vs "Reporting: XSLX, PDF, Interactive Viewer" (Interactive Viewer additionally offering Word, PPT, Postscript, CSV). [Source](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/DataView-ReportComparison.htm)

---

## Finding 6 — The Dataview escape hatch: real, manager-self-serve, but probably the wrong shape

If the customer's admin won't touch the report design, there is a second documented path that needs no admin:

- **Manager-driven column choice, and it persists if saved.** Columns are added/removed via the Filter control ("ClickTap **Filter** to the right of the columns to display the list of columns that are available to show or hide"); "Your selected filters do not persist for future sessions, **unless you save the Dataview**." Available columns explicitly include **Employee ID** and **Badge number**. [Source](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/content/dataviews/PersonalizeData.htm)
- **Export path:** Main Menu → Dataviews & Reports → Dataview Library → select a Dataview → **Share → Export**; ".csv file appears at the bottom of the page and is saved in your Downloads folder"; "You must have permission to access downloads." [Source](https://library.ukg.com/docs/en-us/UKG_Dimensions/Platform/Information_Access/Download_a_Dataview/Download_a_Dataview.html)

**The blocker is granularity, and it is unconfirmed.** Dataviews appear to be aggregate-shaped: the one documented granularity statement I found is "one row per **location/job** per day" (Schedule Metrics by Day), and the scheduling Dataviews are described as *metrics* views — hours variance against budget/target. [Source](https://library.ukg.com/docs/en-us/UKG_Pro_WFM/Advanced_Scheduling/Advanced_Scheduling/Review_Schedule_Metrics_Using_Dataviews/Review_Schedule_Metrics_Using_Dataviews.html) Whether any Dataview can emit **one row per shift segment with a start and end time** — which is what `core/` needs, and specifically what split-shift detection needs — is **not confirmed by any page I could reach.** If it cannot, the Dataview route is dead for v1 regardless of how good its identifier story is.

Treat it as a *candidate second parser to validate against a real file*, not a fallback we can promise.

---

## Secondary: Deputy and When I Work — the same pattern, and it is worse

The ticket asked this as a secondary because #02 names these as the next parsers. The answer generalises the UKG finding into something uncomfortable: **for both products, the schedule export's column inventory is undocumented, and the identifier is documented on every *other* export.**

### Deputy

- **The export flow is confirmed**, and richer than #02 recorded: Schedule → **Options** → **Export Schedule** (CSV, JSON) or **Print Schedule** (PDF, Excel/XLSX); the only other options are an *Include Leave* checkbox and the Location/Date/View selectors. **No column-selection option is documented.** [Source](https://help.deputy.com/hc/en-au/articles/4688737187343-Printing-your-schedule)
- **The column inventory is UNCONFIRMED.** The article describes the CSV only as "The scheduled shifts for the time period you selected in the schedule view will be exported in a **list format**" and shows the columns *only in a screenshot*. The JSON is described as "structured data format… commonly used for integrations" with **no field list**. No Deputy page names any column of the schedule export. [Source](https://help.deputy.com/hc/en-au/articles/4688737187343-Printing-your-schedule)
- **Two distinct identifiers exist, and both are documented in *other* exports.** `Deputy ID` — "A unique sequential number automatically assigned to users by Deputy… This number should NOT be changed" — and `Payroll ID` (e.g. `JJ4675`) both appear in the **People bulk export**. [Source](https://help.deputy.com/hc/en-au/articles/5898002694287-Bulk-import-or-bulk-update-team-member-data) The **timesheet** "All fields" export's first column is `Employee Export Code` = the Payroll ID — and notably carries *no* numeric Deputy ID. [Source](https://help.deputy.com/hc/en-au/articles/10280964458895-Export-Timesheets-as-format-CSV-Excel-All-Fields) Payroll ID is explicitly **optional**, so it may be blank. [Source](https://help.deputy.com/hc/en-au/articles/4658190393743-Add-or-update-a-team-member-s-Payroll-ID-in-Deputy)
- **Shift-grain id in a file exists, but behind a paywall or a migration tool.** Deputy Analytics' `Shifts` dataset documents `Shift ID`, **`Employee ID`**, `Employee payroll id` — but custom reports off it require **Analytics+**. [Source](https://help.deputy.com/hc/en-au/articles/14314963510671-Data-Dictionary-S-Z) The System-Administrator-only **Data Exporter** can dump the `Roster` and `Employee` tables as CSV, but its per-table columns are undocumented and Deputy frames it as a leaving-Deputy tool ("export and import formats will not match"). [Source](https://help.deputy.com/hc/en-au/articles/4755408081167-How-to-export-or-download-your-data)
- **The API has no identity problem:** the V1 `Roster` object carries `Employee` (integer) plus `_DPMetaData.EmployeeInfo`. [Source](https://developer.deputy.com/reference/createroster-1.md) · [Source](https://developer.deputy.com/docs/getting-shifts.md)
- **The sharpest signal, and it is a negative one:** Deputy's own shift-level *spreadsheet interchange format* — the schedule bulk import — has **no id column at all** (Group Reference, First/Last Name, Email, Start/End, Location, Area, breaks, Comment, Published, Open…) and states twice that "**Employees are matched on the email address** and not on First Name/Last Name." [Source](https://help.deputy.com/hc/en-au/articles/6325924665871-Bulk-import-schedules-and-timesheets) Deputy's answer to the identity problem in a flat shift file is **email**, not an id. Worth remembering when #06's invariant meets a Deputy parser.

### When I Work

- **Two-tab structure confirmed** — tab 1 "a **list view of the schedule** within the specified date range", tab 2 "your user's **total scheduled hours and wages**". Options are Start/End Date, Schedules/Job Sites/Positions/Users filters, and a *Split into separate schedules* checkbox. **No column-selection option.** Limits: max 4,000 rows, includes unpublished shifts, excludes time off, available only from Day or Week view. [Source](https://help.wheniwork.com/articles/exporting-schedules/)
- **Column inventory UNCONFIRMED for both tabs.** The page has no column list, and its two screenshots show the export *button* and *dialog* — not the resulting spreadsheet.
- **The contrast is stark and diagnostic.** WIW *does* enumerate columns for the **timesheet** export, and it includes an id: "first name, last name, **employee ID**, date, start time, end time, paid rest breaks, unpaid meal breaks, regular hours…" [Source](https://help.wheniwork.com/articles/exporting-time-sheets-computer/) The **Users** export likewise "contains user's contact information, positions, tags, assigned schedules, **employee ID**, max hours, and base hourly rate." [Source](https://help.wheniwork.com/articles/exporting-users/) So WIW documents an id column on its per-*timesheet-row* export and on its per-*user* export, and documents nothing about its per-*shift-row* export.
- **Two different ids, do not conflate them.** `user_id` / `id` is the internal numeric key present on every shift in the API ("The user assigned to the shift. Set to `0` for an Open Shift"), alongside `id`, `account_id`, `location_id`, `position_id`, `creator_id`. [Source](https://apidocs.wheniwork.com/external/index.html) "Employee ID" (API: `employee_code`) is a different thing — "A unique numeric identification code **set by your employer**", used to clock in at terminals, therefore **manager-populated and possibly blank**. [Source](https://help.wheniwork.com/articles/where-can-i-find-my-employee-id/) The id named in the Users and Timesheets exports is `employee_code`, not `user_id`.

### What this means for #06's invariant beyond UKG

Same verdict shape, lower confidence, and one new hazard:

1. **"Undocumented column inventory" is the norm, not a UKG quirk.** Three vendors, three schedule exports, zero published column lists. The generalisable conclusion is that **no vendor's schedule-export column inventory can be resolved from docs — only from a sample file.** Any future parser therefore needs a real file before its preset can be written, and #06's "loud rejection of unmatched files" is the right posture precisely because we cannot pre-verify.
2. **The identifier is systematically present in the *people* export and absent-or-unconfirmed in the *schedule* export.** That pattern (across two independent vendors, plus UKG's own delivered reports) is strong circumstantial support for treating **name-keyed schedule files as the default assumption** and an id column as the exception we must ask for.
3. **New hazard for #06:** where an identifier *is* offered in these products it is often the **optional, employer-populated** one (Deputy `Payroll ID`, WIW `employee_code`) rather than the system surrogate key. A column can therefore be *present and blank*. #06's invariant checks for the **column**; it must also treat a blank cell in a present id column as `SOURCE_ROW_UNPARSEABLE` rather than as a valid empty-string key — which the prototype does handle ([`ukg-parser.ts:109`](../prototypes/06-canonical-model/ukg-parser.ts)), and which should be recorded as a deliberate requirement rather than an accident.
4. **The API route is clean for all three.** UKG (`id` + `qualifier`), Deputy (`Roster.Employee`), When I Work (`Shift.user_id`) all carry a stable id on the shift object. #02's recommendation to make UKG Pro WFM the first post-v1 API parser gains a second justification: **the API is the only ingestion path where identity is guaranteed rather than negotiated.**

---

## What could NOT be confirmed from public pages

Recorded honestly, in #02's spirit — these are the facts a builder must resolve against a real tenant or a real file, not against docs:

1. **The full column library** of Schedule Planner Column Sets, Dataviews, or any scheduling RDO. UKG publishes none of these inventories. (The WFC 8.1 Schedule Planner setup page confirms only that "the first column is **Person Name**, which is required" and that adding columns means picking a "Column name and Label" — the picklist itself is not published. [Source](https://communityfiles.ukg.com/support/KOL/onlinehelp81/Subsystems/Help-SCH/Content/Setup/ConfigureSchedulePlanners.htm))
2. **Whether the Dataview column labelled "Employee ID" is `personNumber` or `personKey`.** These are documented as different values; a preset that accepts either is fine for our purposes (both are stable within a tenant), but the *label* the customer sees is what our header-synonym list must match.
3. **The exact Pro WFM function-access control point for Report Studio.** Confirmed only that Application Setup access is required; the named control point is documented for legacy WFC, not Pro WFM.
4. **Whether the scheduling-domain RDO in an arbitrary tenant exposes a person identifier**, or whether a UKG Salesforce Service Request is needed to get one. Documented as a requirement for Healthcare Productivity custom reports; scope beyond that unstated.
5. **Whether `personNumber` is unique and required.** The developer docs show it but never say so. (Uniqueness is effectively implied by badge-reassignment rules and by its use as a request qualifier, but it is not stated.)
6. **Whether a Dataview can emit one row per shift segment with start/end times** — the crux of Finding 6.
7. **Whether the anchor tenant's `Custom Daily Schedule` report can be edited by the customer at all**, versus having been delivered by UKG Professional Services. Unknowable from outside; ask the design partner.
8. **Any column name of Deputy's schedule CSV/XLSX export, or of its JSON export's fields.** Undocumented; the JSON is the likeliest place ids appear (it is pitched at integrations) but that is a guess — do not rely on it.
9. **Any column name of either tab of When I Work's schedule export**, and the grain of tab 2 beyond "total scheduled hours and wages".
10. **Whether either Deputy's or WIW's schedule export can be configured to add an id column.** Neither help page documents column selection; absence of documentation is not proof of absence of the feature.
11. **Per-table column lists for Deputy's Data Exporter dumps** (including `Roster`) — the source-table list is documented, the columns are not.

---

## Verdict — mapped onto the ticket's three routes

### **"Admin-configurable only" holds.** Confidence: high.

Not "available by default", and emphatically not "not available".

**Why not "available by default":** the anchor file demonstrably has no identifier column today — five columns, name-keyed identity, confirmed from the shipped parser (Finding 4) — and every UKG-*delivered* schedule-shaped report is likewise name-only (*Location Schedule Detail - Weekly*, *Staffing Sheet Daily*). There is nothing to default to: our anchor is a **custom** report, so its columns are whatever its author chose, and its author chose name.

**Why not "not available":** the identifier exists at every layer of UKG — `personNumber` / `personKey` / badge number in the data model and API (Finding 3), `Employee ID` and `Badge number` in the Dataview column library, and a UKG-delivered scheduler report (*Good Faith Estimate - Employment Terms*) that renders `Employee ID` in a column. The capability is unambiguous.

**Why "admin-configurable" and not "manager-configurable":** UKG says it in one sentence — users can show/hide and re-sequence columns, but "any changes will not be applied the next time they run a report. Persistent changes for reports can be achieved by the **Administrator in report studio** as part of the Report design process." The run dialog offers Timeframe, Hyperfind, Output Format — and no column picker. `CSV_Export_Column_Names_Order` controls order, not membership. So the person who runs our export cannot fix this; a UKG administrator with Application Setup access must edit the report design in Report Studio and republish it.

### Consequences (the ticket's own branch, plus what the evidence adds)

Per the ticket, this route means **#06 decision 2 stands** and **onboarding grows a hard prerequisite**. Three things the evidence adds:

1. **The prerequisite is heavier than a tutorial step, and it lands on the wrong person.** The ticket anticipated teaching the exporter to add a column. They can't. The change is a *report re-design by a UKG admin*, which for a multi-location chain means an internal IT/HR ticket, possibly a UKG Salesforce SR if the RDO lacks the field, then republishing plus Report Data Access Profile assignment. This is a **pre-sales/implementation task with a lead time**, not a wizard step — the export tutorial's job shrinks to *verifying* the column is present and *naming the ask precisely* if it isn't.
2. **The tutorial rewrite must be re-pointed as well as re-scoped.** `UkgMock.js`'s 12 steps walk *Report Library → Custom Reports → Custom Daily Schedule*, not the Schedule Planner — so the "Onboarding / export-tutorial rewrite" item in `map.md` should be re-titled off "Schedule Planner". The existing first-step callout ("**Manager or admin access required.** Schedule access at your organization is required to access this report.") is the right place to hang the new, stronger prerequisite. [`src/wizard/steps/ExportHelpStep.js:28`](../../../src/wizard/steps/ExportHelpStep.js)
3. **The rejection message needs to name the right artefact and the right person.** The #06 prototype's copy — "Re-run the UKG report with an employee identifier column included" ([`ukg-parser.ts:71`](../prototypes/06-canonical-model/ukg-parser.ts)) — asks for something the manager cannot do, and will read as our bug. It should instead name the report, the field, and the role: *ask your UKG administrator to add an employee-number column to the "<report name>" report design in Report Studio.*

**And one real risk the ticket did not anticipate, which the product decision should weigh:** the "customer whose admin won't" case is not exotic. Our own anchor customer is currently in it. The ticket's noted fallback (name-keying plus hard collision detection on physically-impossible overlapping segments) is not reopened by this research — but it is now clearly a **route for a real, present customer**, not a hypothetical, and #06's own reasoning for rejecting it (two same-named employees merging into a fabricated split shift that cancels a required meal) is exactly the failure the current shipped tool is exposed to today. Worth a decision, not a default.

**Header synonyms to expect** (for the v1 preset — the #06 prototype's list is close and should be widened): `Person Number`, `Employee ID`, `Employee Number`, `Badge`, `Badge Number`, `ID`. Note `ID` alone is what People Information and employee search call it, and is a plausible label an admin would type into Table Builder's column-header field — but it is also dangerously generic, so match it only in a header row that already matched the format.

---

## Sources

UKG report/export mechanics: [Run reports](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/Reports/RunReports.htm) · [Export report content and data](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/ExportReports.htm) · [CSV output](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/MasterTopics/ReportAppendices/CSV_output.htm) · [Reports–Dataviews comparison](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/DataView-ReportComparison.htm) · [Standard reports](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardDomainReports.htm)

Report design / administration: [Design and administer reports (Report Studio, RDO, Table Builder)](https://customer2.kronos.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/ApplicationSetup/Reports/AdministerReports.htm) *(404 on direct fetch; text verified via search index)* · [Publish reports](https://customer2.kronos.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/PublishReports.htm) · [Custom Healthcare Productivity Reports (RDO / Salesforce SR)](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardReports/HealthcareProductivity/ReportsHCPCustom.htm) · [WFC 8.1 Reports (legacy `.rptdesign` + Report Setup Access)](https://communityfiles.ukg.com/support/KOL/onlinehelp81/Subsystems/Help-SAG/Content/wfc_sag/Reports.htm)

Scheduler reports (column inventories): [Scheduler reports index](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardReports/Scheduler/StandardScheduleReports.htm) · [Employee Schedule - Weekly](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardReports/Scheduler/EmployeeSchedule.htm) · [Location Schedule Detail - Weekly](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/Reports/StandardReports/Scheduler/LocationScheduleDetailWeekly.htm) · [Staffing Sheet Daily](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/Reports/StandardReports/Scheduler/StaffingSheetDaily.htm) · [Good Faith Estimate - Employment Terms](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Reports/StandardReports/Scheduler/GoodFaithEstimateEmploymentTerms.htm)

Dataviews: [How to personalize a Dataview (column list incl. Employee ID, Badge number)](https://communityfiles.ukg.com/support/kol/onlinehelp-workforcedimensions/en-us/content/dataviews/PersonalizeData.htm) · [Download a Dataview](https://library.ukg.com/docs/en-us/UKG_Dimensions/Platform/Information_Access/Download_a_Dataview/Download_a_Dataview.html) · [Review Schedule Metrics Using Dataviews](https://library.ukg.com/docs/en-us/UKG_Pro_WFM/Advanced_Scheduling/Advanced_Scheduling/Review_Schedule_Metrics_Using_Dataviews/Review_Schedule_Metrics_Using_Dataviews.html) · [Work with Dataviews](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Dataviews/About_DV_nc.htm)

People / identifiers: [People Information → Employee (ID field)](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/PeopleInfo/Employee.htm) · [Search for an Employee](https://library.ukg.com/docs/en-us/UKG_Dimensions/Platform/Information_Access/Search_for_Employee/Use_EE_Search.html) · [A Guide to People Information (personIdentity / personKey / personNumber)](https://developer.ukg.com/wfm/docs/a-guide-to-people-information-doc) · [Retrieve employee details and view schedules (`schedule/multi_read`)](https://developer.ukg.com/wfm/docs/retrieve-employee-details-and-view-schedules-doc)

Schedule Planner: [Configure Schedule Planners (WFC 8.1 — Person Name required first column)](https://communityfiles.ukg.com/support/KOL/onlinehelp81/Subsystems/Help-SCH/Content/Setup/ConfigureSchedulePlanners.htm) · [Schedule display controls](https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/Scheduling_Manager/ScheduleDisplay.htm)

Deputy: [Printing your schedule (export flow + formats)](https://help.deputy.com/hc/en-au/articles/4688737187343-Printing-your-schedule) · [Bulk import/update team member data (Deputy ID, Payroll ID)](https://help.deputy.com/hc/en-au/articles/5898002694287-Bulk-import-or-bulk-update-team-member-data) · [Timesheet export, all fields](https://help.deputy.com/hc/en-au/articles/10280964458895-Export-Timesheets-as-format-CSV-Excel-All-Fields) · [Bulk import schedules (email-keyed)](https://help.deputy.com/hc/en-au/articles/6325924665871-Bulk-import-schedules-and-timesheets) · [Export or download your data (Data Exporter)](https://help.deputy.com/hc/en-au/articles/4755408081167-How-to-export-or-download-your-data) · [Payroll ID](https://help.deputy.com/hc/en-au/articles/4658190393743-Add-or-update-a-team-member-s-Payroll-ID-in-Deputy) · [Team member details report](https://help.deputy.com/hc/en-au/articles/11980408677775-Team-member-details-report) · [Analytics Data Dictionary (S–Z), Shifts dataset](https://help.deputy.com/hc/en-au/articles/14314963510671-Data-Dictionary-S-Z) · [Roster OpenAPI](https://developer.deputy.com/reference/createroster-1.md) · [Getting Shifts](https://developer.deputy.com/docs/getting-shifts.md)

When I Work: [Exporting Schedules](https://help.wheniwork.com/articles/exporting-schedules/) · [Can I Export My Data?](https://help.wheniwork.com/articles/exporting-data-computer/) · [Exporting Users](https://help.wheniwork.com/articles/exporting-users/) · [Exporting Timesheets](https://help.wheniwork.com/articles/exporting-time-sheets-computer/) · [User Import Template](https://help.wheniwork.com/articles/download-the-user-import-template/) · [Where can I find my employee ID?](https://help.wheniwork.com/articles/where-can-i-find-my-employee-id/) · [API documentation](https://apidocs.wheniwork.com/external/index.html)

In-repo primary evidence (the real tenant and the real file): [`src/wizard/UkgMock.js`](../../../src/wizard/UkgMock.js) · [`src/wizard/steps/ExportHelpStep.js`](../../../src/wizard/steps/ExportHelpStep.js) · [`src/core/constants.js`](../../../src/core/constants.js) · [`src/core/BreakScheduler.js`](../../../src/core/BreakScheduler.js) · [`src/facades/ExcelFacade.js`](../../../src/facades/ExcelFacade.js) · [#06 parser prototype](../prototypes/06-canonical-model/ukg-parser.ts)
