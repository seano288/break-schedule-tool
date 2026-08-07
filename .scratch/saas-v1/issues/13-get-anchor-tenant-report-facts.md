# Get the anchor tenant's report facts from the design partner

Type: task
Status: claimed

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

## Prepared for the partner conversation — 2026-08-07

**Repo state checked, so the third "Done when" item is unambiguous: we hold no real export of any kind.** `find` over the repo returns zero `.xlsx`/`.xls`/`.csv`; `tests/fixtures/scheduleData.js` is the only schedule data and is synthetic. So all three items are outstanding — the "if not already" on the Custom Daily Schedule export resolves to **yes, we need it too**.

**One thing fixed while checking:** `.gitignore` covered `*.xlsx` but not `*.csv` — and the Dataview route is **CSV-only** (#08 finding 5). A real Dataview export dropped in the repo would have been committed with employee names in it. `*.csv` added. Note this cuts both ways: `coverage-groups.json`-style config is fine, but if any *intended* CSV fixture is added later it now needs `git add -f`.

### Ask 1 — who owns the Custom Daily Schedule report?

Phrase it as access, not as report design — the person answering is a retail ops manager, not an admin:

> When your Custom Daily Schedule report was set up in UKG, did someone at your company build it, or did UKG configure it for you? And if you wanted a column added to it, who would you ask?

The second sentence is the one that actually settles it. "I'd raise a ticket with our IT/HR systems person" → customer-editable, #11's name-keyed mode is a **bridge**. "I'd have to go back to UKG" / "no idea, it's just always been there" → treat as **PS-delivered**, name-keyed mode is this customer's **permanent** route, and the onboarding fog item leads with the fallback.

### Ask 2 — the Dataview trial (the valuable one)

This is manager-self-serve, needs no admin, and takes about five minutes. Exact path from #08:

1. Main Menu → **Dataviews & Reports** → **Dataview Library**
2. Open any **schedule**-flavoured Dataview
3. Click **Filter** to the right of the columns → show/hide list → confirm whether **Employee ID** is offered, and add it
4. **Share → Export** → a `.csv` lands in Downloads

**The one thing to look at in the file** — and the whole ticket turns on it: does each row represent **one shift with a start time and an end time**, or one row per location/job per day with **totals/hours** on it? Only the first is usable. If a person who works 7–11am and 2–6pm shows as **two rows**, that is the answer we want. If they show as one row with "8 hours", the route is dead.

Note the export is **CSV only** — if they come back with `.xlsx` they exported a report, not a Dataview.

### What to collect — ask as a ladder, not all-or-nothing

Three asks of very different cost, each buying something the one above it cannot. Start at the top and take whatever you can get. **Do not lead with rung 3** — it is the most sensitive request, and only one of the open unknowns actually requires it.

**Rung 1 — a screenshot of the header row.** Cheapest possible ask, no data leaves their building, can happen live in the conversation. Buys the **column header strings**, which we have never had (see below) and which #06's `detect` and #08's header-synonym list both require. Also settles the Dataview granularity question on sight — two rows for a 7–11 / 2–6 worker vs one row reading "8 hours".

**Rung 2 — an export from their non-production tenant.** Enterprise UKG customers typically run a test/sandbox tenant populated with fake employees. Same report, same format, same quirks, **no real people** — so most of the handling problem below disappears. Ask their IT contact rather than the ops manager: *"do you have a test environment, and can you run the Custom Daily Schedule report there?"* Best value on the ladder; try it before rung 3.

**Rung 3 — a real week, unredacted.** Buys the one thing the other two cannot: **the multi-segment rate** — how often one employee has two segments in a day — which is the number that says whether [#11](11-decide-missing-employee-id-fallback.md)'s degraded mode is usable or merely legal. It also settles blank-vs-absent id cells on real data. Redaction is acceptable *only* if same-name collisions are preserved, which is a fiddly thing to ask of someone; prefer a fake-data tenant over a redacted real file.

Whatever rung is reached, collect for **both** formats — the **Custom Daily Schedule** `.xlsx` and the **Dataview** `.csv` — including when the Dataview comes back aggregate, because ruling that route out is a result and the evidence belongs here. Note we have never seen a real Custom Daily Schedule export: `UkgMock.js`'s 500-line click-through was built from screenshots, and every parser assumption rests on that.

### The header strings have never been recorded — a real gap, found while preparing this

The shipped tool parses a real file, so it is natural to assume its column names are known somewhere. **They are not.** `src/core/constants.js:84-92` keys entirely on **position** — `DEPT: 0, JOB: 1, NAME: 2, SHIFT: 3`, after column D is deleted — and reads no headers at all. Positional parsing let the original tool ignore them, so the header text was never written down anywhere in this project.

That did not matter then and does now: [#06](06-design-canonical-model-and-parser-interface.md) decision 5 gives each format a `detect` function, and [#08](08-confirm-ukg-employee-id-column.md) calls for a header-synonym list matching what the customer actually sees. Both need the strings. This is **why rung 1 is worth asking for on its own** — one photo of row 1 closes a hole no amount of documentation research could, per #08's finding of zero published column inventories across three vendors.

### Handling

We are about to hold real employee data for the first time. These files are for parser work on a developer machine, not for the product: keep them out of the repo (now enforced by `.gitignore`), and derive committed fixtures **by hand** rather than pasting rows across. Same posture the product itself promises — worth being able to say we followed it. Rung 2 sidesteps the question entirely, which is most of its value.

### Note for future format work — not this ticket

[#02](02-research-integrations-landscape.md)'s "partner-gated, no self-serve" finding is about **APIs**; it never asked whether the *products* have self-serve trials. Deputy, When I Work and Homebase are SMB self-serve tools that do — sign up, build a fake schedule, export it, and you hold a real file with real headers and no PII in an afternoon (Deputy also publishes `apisupport@deputy.com` for sandbox access). So **"we need a real file before we can write a preset" binds only on UKG**; every post-v1 parser is self-serviceable without a customer. Recorded because it was found while working this ticket. Changes no v1 decision.

### Then

The multi-segment rate is the deliverable measurement once the Custom Daily Schedule file is in hand: count employee-days with more than one segment, as a fraction of all employee-days. That single number is what says whether [#11](11-decide-missing-employee-id-fallback.md)'s degraded mode serves this customer or merely avoids breaking the law for them.

## Answers

<!-- record both answers here on return; attach or reference the collected files by path -->

