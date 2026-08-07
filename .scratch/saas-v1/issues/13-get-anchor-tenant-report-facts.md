# Get the anchor tenant's report facts from the design partner

Type: task
Status: open

> **Raised by [#11](11-decide-missing-employee-id-fallback.md).** Two facts about the one real customer we have are unknown, unobtainable from public documentation ([#08](08-confirm-ukg-employee-id-column.md) enumerates both as "ask the design partner"), and each changes the shape of downstream work. Neither blocks v1 — #11 shipped a fallback *because* these are unknown — but both are cheap, and one conversation answers both.

## Question

Nothing to decide. Two facts to obtain from the design partner, and a sample file to collect.

## The asks

**1. Is the "Custom Daily Schedule" BIRT report customer-editable, or was it delivered by UKG Professional Services?**

#08 established the anchor file is a **customer-authored custom BIRT report** in the Report Library (our own `UkgMock.js` walks Main Menu → Dataviews & Reports → Report Library → Custom Reports → Custom Daily Schedule), not a Schedule Planner export — so its columns are by construction the customer's own report design. What is unknown is whether anyone inside the customer org can *change* that design.

- **Customer-editable** → someone there has Application Setup / Report Studio access; adding the id column is an internal IT/HR ticket with lead time. #11's name-keyed mode is a **bridge**.
- **UKG-PS-delivered** → changing it means a paid engagement or a Salesforce Service Request. #11's name-keyed mode is a **permanent route** for this customer, and the onboarding fog item should stop framing the id column as an expected prerequisite.

**2. Can they produce a Dataview export at shift grain?** — *the more valuable ask.*

#08's escape hatch, reframed by #11 from *blocker* to **the anchor customer's best real fix**: a Dataview needs **no admin**, has manager-selectable columns including *Employee ID*, persists via saving the Dataview, and exports through Share → Export (**CSV only**). If it works, the anchor customer reaches `identityKind: 'unique'` without waiting on anyone.

What #08 could **not** confirm from public pages, and what a sample file settles in one look: whether any Dataview emits **one row per shift segment with start and end times**. The only documented granularity is aggregate ("one row per location/job per day"), which would be useless — the canonical model needs segment start/end.

**Collect the sample file itself**, not just a yes/no. Under [#06](06-design-canonical-model-and-parser-interface.md) decision 5 (one code module per format) a Dataview CSV is a **second parser**, not a preset variant — and #08 found that *no* vendor's schedule-export columns are resolvable from documentation, only from a real file. The same trip should also collect the **existing** custom report's real export if we do not already hold one; #11 worked entirely from synthetic fixtures (`tests/fixtures/scheduleData.js`), so nobody has measured how often the anchor file actually produces multi-segment employee-days — i.e. how much the degraded mode really costs this customer.

## Done when

- Both questions answered on the record here.
- A real Dataview export attached (or its shift-grain granularity ruled out with the evidence).
- A real "Custom Daily Schedule" export held, if not already.

## What each answer changes

- **Dataview works at shift grain** → raises a parser ticket for a second format, and the onboarding fog item gains a no-admin route that sidesteps the report re-design entirely.
- **Dataview is aggregate-only** → #08's escape hatch closes for good; degraded name-keyed mode is the anchor customer's only path until an admin acts, and #11's decision to ship it is retroactively load-bearing rather than merely prudent.
- **Report is PS-delivered** → the onboarding rewrite must lead with the fallback, not the prerequisite.
- **Real file in hand** → the multi-segment rate becomes measurable, which is the one number that says whether degraded mode is usable or merely legal.
