# Decide the fallback for exports lacking an employee-id column

Type: grilling
Status: resolved

> **Raised by [#08](08-confirm-ukg-employee-id-column.md).** [#06](06-design-canonical-model-and-parser-interface.md) decision 2 made `employeeId` required and rejects any file without one. #08 confirmed the column is **admin-configurable only** — and that **our own anchor customer's export has no id column today**. So the invariant currently rejects 100% of the one real file we have. #08 explicitly does *not* reopen decision 2; this ticket decides what happens to the customer standing on the wrong side of it.

## Question

What does v1 do when a customer's export has no employee-id column — hard-reject and make the admin report re-design a hard prerequisite, or ship a fallback identity strategy?

## Why it is not just "reopen #06"

#06's hazard is real and unchanged: name-keyed identity merges two same-named employees into one person with a gap, which reads as a split shift, which lets `gapSatisfiesMealPeriod()` **cancel a legally required meal**. The question is not whether that hazard exists but whether **hard rejection is the right response to it**, given the cost is now known to be an admin report re-design with lead time (possibly a UKG Salesforce SR) rather than a checkbox.

Note the asymmetry #08 exposed: **the shipped free tool is already exposed to this exact failure** (it keys identity on `formatName(row[2])`). Hard rejection is therefore strictly safer than the status quo, not a regression — but it converts a working user into a blocked one.

## To resolve

- **First, a fact only the design partner has:** is the anchor tenant's custom report **customer-editable at all**, or was it delivered by UKG Professional Services? #08 lists this as unconfirmable from public pages and says to ask. This changes the fallback from a bridge into a permanent route.
- **The three candidate routes.** (a) Hard-reject, prerequisite owned in onboarding. (b) Name-keying + **hard collision detection** — overlapping segments under one name are physically impossible, so they are a free, reliable signal; the open question is what the *non*-overlapping same-name case does (that is precisely the fabricated-split-shift case, and it is undetectable). (c) The **Dataview escape hatch** — needs no admin, manager-selectable *Employee ID*, but #08 could not confirm a Dataview emits **one row per shift segment with start/end times**; documented granularity is aggregate. Validating (c) needs a real sample file.
- **If a fallback ships, is it degraded-mode or equal-mode?** Does a name-keyed run carry a standing warning / a per-employee exception, and does it reuse the [#06](06-design-canonical-model-and-parser-interface.md) exception channel or need a new document-level channel?
- **Email as a third identity strategy** — #08 found Deputy's shift-grain interchange format matches on email with no id at all. Is `employeeId` really "the id column", or is it "any stable key the parser can name"?
- **The blank-cell rule**, which #08 asks to record as deliberate: a **present** id column with an **empty cell** is `SOURCE_ROW_UNPARSEABLE`, not a valid empty key. Vendors often ship the id as optional/employer-populated, so present-but-blank is the common case, not the rare one.

## Answers that change the route

- **Hard-reject** → onboarding grows a hard, sales-time prerequisite; the anchor customer cannot use v1 until their admin acts; rejection copy must name report, field, and role.
- **Fallback ships** → #06's model gains an identity-provenance notion (was the key an id, or a name?), and the exception channel likely grows a document-level tier.

## Answer

**A fallback ships: v1 accepts id-less exports in an explicitly degraded, name-keyed mode — and the ambiguous employee-days it produces are refused rather than guessed.** [#06](06-design-canonical-model-and-parser-interface.md) decision 2's hard rejection is replaced. Not because its hazard was wrong — it is real and reproduced below — but because hard rejection is a disproportionate *response* to it once [#08](08-confirm-ukg-employee-id-column.md) established that the cost is an admin report re-design of **unknown feasibility**.

### The finding that reframed the ticket: neither guess is safe

The ticket (and #06 before it) framed name-keying as trading a known hazard for convenience — merge two same-named people, `gapSatisfiesMealPeriod()` cancels a required meal. That hazard is live in shipped code: `BreakScheduler.js:34` keys identity on `formatName(row[2])`, and `EmployeeSchedule.gapSatisfiesMealPeriod()` (`:124-128`) returns true on **any** gap ≥ 30 min with no timing check, so `mealsRequired()` (`:146`) decrements. The single surviving meal is then placed on the merged timeline and lands in **one** of the two people's segments — the other gets no meal at all.

But the ticket assumed the opposite guess was available. It is not. Working the arithmetic on a 4h + 6h pair:

- **Merge (assume split shift):** one 10h person → 2 meals required → gap cancels one → 1 meal, placed in one segment. The other person gets **zero**. Violation.
- **Split (assume two people):** a *genuine* 10h split-shift worker is owed **2 meals**. Scheduled as two independent people: 0 (4h) + 1 (6h) = **1 meal**. Also under-schedules. Also a violation.

So an ambiguous employee-day **cannot be scheduled correctly in either direction**. This is why the route is not "pick the safer default" — there isn't one. `tests/fixtures/scheduleData.js` confirms the two cases are byte-identical in the file: `SPLIT_SHIFT_SCHEDULE` stores a genuine split shift as **two rows sharing a name**, exactly the shape two same-named employees produce.

What *is* fully reliable is that the ambiguity is **detectable**. Under name-keying, "one key, more than one segment in a workday" is precisely the load-bearing set. Unresolvable, but never silent — which is what makes the fallback shippable.

### Decisions

**1. Identity strategy is chosen by the parser *after scanning the column*, not from the header match alone.** Populated id column → `unique`. Column absent → name-keyed → `ambiguous`. Email → `unique`.

**2. An id column that is blank on every row is re-read as absent**, falling back to name-keying. #08 warned that where vendors do offer an id it is often the optional, employer-populated one (Deputy `Payroll ID`, WIW `employee_code`), so **present-but-blank is the common case, not the rare one**. Applying the blank-cell rule uniformly to an all-blank column would poison 100% of rows and hand back an empty workbook — strictly worse than if the column had never been there. The blank-cell rule below still governs the **mixed** case, which is the case it was actually written for.

**3. The blank-cell rule is confirmed as deliberate** (#08 asked for this on the record): a **blank cell in a partially-populated id column** is `SOURCE_ROW_UNPARSEABLE`, never a valid empty key. Already built — `prototypes/06-canonical-model/ukg-parser.ts:105-115`. Unchanged by decision 2, which is about the wholly-empty column only.

**4. `Segment.employeeId` → `employeeKey`; identity provenance splits into two fields with two different jobs.** *(Amendment to #06, recorded there.)* The field stays required and non-null — the parser always synthesizes a key — so `core/` never gets a null branch. The `ParseSuccess` envelope gains:
   - **`identityKind: 'unique' | 'ambiguous'`** — the **only** thing `core/` branches on. Binary because the question that changes behavior is binary: *can this key collide?*
   - **`identityLabel`** — free text (`"Employee ID"`, `"Email"`, `"Employee Name"`), for the manager-facing notice and #12 telemetry.

   This answers the ticket's model question — `employeeKey` is **any stable key the parser can name**, not "the id column". Email is the proof case: it lands in `unique` with **no new core path**, and a future parser adds a *label*, never a *branch*. The rename matters because `employeeId` lies whenever it holds a synthesized name key, and #09/#10 both read this field.

**5. `core/` owns the ambiguous-employee-day rule, not the parser.** When `identityKind === 'ambiguous'`, any employee-day whose key carries more than one segment is emitted as an **`IDENTITY_AMBIGUOUS`** exception on #06's existing per-employee-day channel and **scheduled not at all**. Chosen against the cheaper option of poisoning in the parser: #06 d1 deliberately put split-shift detection in `core/` because mis-grouping is compliance-relevant and needs **one audited home**, and #06 d5 makes parsers one-module-per-format — so parser-side poisoning would have every future parser re-implement a compliance rule, which is the **drift** failure mode the map keeps citing. [#01](01-audit-ca-compliance-completeness.md)'s caution that edits to the compliance core carry legal risk is respected by shape: this is an **additive refusal path**, not a change to the break math.

   Note the rule is inert under `unique` — with a real id, a multi-segment employee-day is a legitimate split shift and schedules normally. This is exactly why provenance must reach `core/` and cannot stay a UI notice.

**6. Degraded, and the warning rides in the workbook.** Three surfaces: (a) a **document-level notice** on `/inspect` and `/schedule`; (b) **per-employee-day exception rows** for each ambiguous day; (c) a **banner in the rendered xlsx itself**. (c) is the load-bearing one — #06 d4 renders output fresh, and the workbook is what leaves the building and reaches HR. A UI-only warning dies the moment the file is downloaded.

**7. `EMPLOYEE_ID_MISSING` stops being a `FatalCode`.** No id column is no longer fatal; it is a downgrade to `ambiguous`. `FORMAT_UNRECOGNIZED` and `REQUIRED_COLUMN_MISSING` are unaffected.

### What fell out

- **The design-partner fact is still unknown**, and that is *why* the fallback is designed as a possibly-permanent route rather than a bridge: nobody has yet asked whether the anchor tenant's custom BIRT report is customer-editable or UKG-PS-delivered. Raises **[#13](13-get-anchor-tenant-report-facts.md)**, which also chases #08's **Dataview escape hatch** — now reframed from *blocker* to *the anchor customer's best real fix*, since it is the only no-admin route to `unique` identity. One conversation answers both.
- **This is the second consumer of the document-level notice channel** [#09](09-define-compute-api-surface.md) said was needed (its first being the tier-3 location assumption). The channel is confirmed as real and owed, not speculative. It remains unowned by any single ticket — it stays on the spec-assembly fog item.
- **[#12](12-define-observability-without-pii.md)'s metric needs re-pointing** — it names `EMPLOYEE_ID_MISSING` rejection rate as the thing that measures this ticket's blast radius, and that code no longer exists. Noted on #12; not resolved here.
- **Hard rejection was never the safe status quo.** #08's asymmetry holds and is now sharper: the shipped free tool merges same-named employees *silently*. Every route considered here — including the one chosen — is strictly safer than what is in production today.
