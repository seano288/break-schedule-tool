# Define the compute API surface

Type: grilling
Status: resolved

> **Raised by [#07 infrastructure stack](07-decide-infrastructure-stack.md).** Settling request granularity at **one request per location-week** collided with [#05](05-draw-ip-protection-cut-line.md)'s thin client, exposing a gap neither #05 nor [#06](06-design-canonical-model-and-parser-interface.md) specified.

## Question

What is the exact HTTP surface of the compute service — endpoints, request/response shapes, and error contract?

**The collision that forces this.** #05 fixed that the client uploads the **raw file** and ships **no parser** and **no `core/`**. #07 fixed that one compute request covers **one location-week**. Together those are incomplete: the client is asked to issue one request per location, but — having no parser — it **cannot know which locations the file contains**. Something must tell it, without putting the canonical model on the wire (#05 forbids that; the model is a server-*internal* seam).

The implied shape is two endpoints, and this ticket confirms or replaces it:

- `POST /inspect` → the location list + preset match-or-loud-rejection. Location *labels* are not rule logic, so returning them does not breach the cut-line — **but this needs an explicit ruling**, since it is the one place server-derived data crosses to the client.
- `POST /schedule?location=…` → the styled xlsx for that location-week (per #05's **R-server** decision).

## To resolve

- **Confirm the two-endpoint shape**, or find a better one. Is `/inspect` a cut-line breach or not? What is the *minimum* it can return?
- **Re-upload vs. re-parse.** The naive reading has the client re-sending the same file on every `/schedule` call (N+1 uploads of a small file, re-parsed each time). Cheap at tens of KB, but wasteful and it grows with location count. Is there a B1-safe alternative that does **not** persist employee data between requests?
- **Partial failure.** N requests means some can fail. What does the client show when 8 of 10 locations succeed? Does the user get 8 workbooks, or nothing?
- **Where the #06 exception channel surfaces.** `CANNOT_COMPLY`, `OVERNIGHT_UNSUPPORTED`, `SOURCE_ROW_UNPARSEABLE` are per-employee-day; they must reach the client per location. Are they in the xlsx, a sidecar JSON, or both?
- **Auth + trial gating** on each endpoint (Clerk session per #07), and where the size ceiling from [#10](10-set-per-request-size-ceiling.md) is enforced.

## Why it matters

This is the contract the greenfield frontend is written against, so it blocks the **Frontend architecture** work. It is also the last place the IP cut-line can leak by accident — #05 spent a whole ticket deciding the client duplicates zero rule logic, and an over-generous `/inspect` response would quietly undo that.

## Answer

Resolved via `/grilling`. The two-endpoint shape is **confirmed**, but resolving it uncovered a **hole in the canonical model** that had to be closed first: the ticket's premise (`core/` partitions by `(location, workday)`) was false.

### The gap that had to be closed first

[#06](06-design-canonical-model-and-parser-interface.md)'s `Segment` has **no `location` field**, and its parser prototype walks `Date:` markers and dept headers while **ignoring the `Location:` row entirely** (`ukg-parser.ts:11` documents it in the sample, then never reads it). Yet [#07](07-decide-infrastructure-stack.md) settled "one request = one location-week" and [#10](10-set-per-request-size-ceiling.md) asserts `core/` partitions to `(location, workday)`. It cannot. Meanwhile `UkgMock.js:427-430` shows UKG's Location run-parameter defaulting to **"All Home Locations"**, so the multi-location file is the *default* export, not an edge case.

This is not a perf issue. Coverage groups key on `dept`/`job`, so two stores that both have `Frontline/Cashier` collapse into **one coverage pool** and the optimizer staggers breaks between employees who never share a building.

**1. `location` becomes a required, non-null field on `Segment`.** The parser always synthesizes one, so `core/` always partitions by `location` with no null branch — keeping the compliance core simple, per [#01](01-audit-ca-compliance-completeness.md). *This is an amendment to #06's model, recorded there.*

**2. Three-tier location sourcing, advisory notice on tier 3 only.**

| Tier | Source | `locationSource` | Notice |
|---|---|---|---|
| 1 | Per-row location column | `column` | none — trustworthy |
| 2 | Document `Location:` row naming **one** store | `document` | none — trustworthy, and yields a real label |
| 3 | Row says "All Home Locations", or absent | `assumed` | **advisory notice** |

Tier 2 is separated deliberately: Location is a UKG **run parameter**, so a manager running the report for their own store leaves that store's name in the row — a genuine fact, not a guess, and a real label for the output's location row. Tier 3 gets one synthetic location plus a visible notice ("no location column — all N employees treated as one location; if this covers more than one store, export each separately").

**Advisory, not blocking, because the damage is quality-only.** Meal placement is bounded to its legal window *before* the optimizer runs: `BreakScheduler.js:193-199` derives `meal1MaxEarly`/`meal1MaxDelay` from `meal1Earliest`/`meal1Latest` (via `MAX_WORK_BEFORE_MEAL = 285`) and passes them as the optimizer's search bounds. Coverage pressure chooses *within* the legal window and cannot push a meal past the 5th hour. A merged pool yields a **worse** schedule, never an **illegal** one — categorically unlike a missing `employeeId`, which cancels a required meal. This also serves the real single-location customer (one store, or a location manager using the tool for their store alone), who must not be blocked by a column they have no reason to have.

### The API surface

**3. Two endpoints, confirmed.**

```
POST /inspect   (multipart: rawFile)
  → { presetId,
      locationSource: 'column' | 'document' | 'assumed',
      locations:   [{ key, label, dayCount, employeeCount, sizeWarning }],   // sizeWarning added by #10
      departments: [{ main, sub }],
      notices:     [ ... ],       // document-level
      exceptions:  [ ...SOURCE_ROW_UNPARSEABLE ],
      fatal?:      { code, detail } }

POST /schedule  (multipart: rawFile, locationKey, weekOf, presetId, settings)
  → { xlsx, previewJson, exceptions }
```

Two things force it, and only these two — an earlier "it maps 1:1 onto the existing wizard" argument was **withdrawn** once the UI was confirmed disposable:

- **Settings cannot be expressed without a parse.** `WizardController._detectDepartments(day.rows)` builds the `{main, sub}` inventory from uploaded rows and `DepartmentsStep.js:30-41` renders coverage grouping against it. With parsing server-side the client has no rows, so **#05's single `{rawFile, presetId, settings}` POST is unsendable by a first-time user** — `settings.groups` is defined in terms of departments only a parse reveals. The flow is **upload → inspect → configure → schedule**.
- **Per-location-week granularity survives.** Internal partitioning bounds each partition to ~130 ms, but total CPU scales with partition *count*: a location-week ≈ 7 × 130 ms ≈ **0.9 s**, while one request for a 50-store week ≈ 350 partitions ≈ **45 s** against a 30 s ceiling. Workers scale across requests, not within one.

Rejected: **one endpoint returning a zip** (all partitions in one invocation → the 45 s problem; nothing delivered until everything finishes; one bad store fails all); **no-inspect blind POST** (fails at step one for any first-time user).

**4. `/inspect`'s ceiling = "only data that was already in the customer's file" — justified by drift, not secrecy.** The IP framing was **re-based** during this session (see map Notes): protecting `core/` from download still matters, resistance to reverse-engineering does not. The ceiling survives on the stronger argument #05's decision 4 actually rested on — client-side rule duplication risks **drift**, "a compliance veneer over a subtle error" (#01). The slippery requests to refuse against it: *return each employee's total hours* (that's `netWork`), *return who needs a second meal* (that's `mealsRequired()`), *return suggested break times* (that's the product). Each is individually defensible; together they rebuild `core/` in the browser. `employeeCount` is the one field beyond bare discovery and is load-bearing — it is how #10's ceiling is checked before compute.

**5. Re-upload per location for v1; the KV handle is deferred, not rejected.** The data-retention posture was **relaxed** this session: B1 means no *long-term* PII retention, not a ban on server-side state, so a short-lived encrypted parse cache is permitted where it is a good trade. It is not one yet — parse is ~10–50 ms against ~900 ms of compute, so the saving is nil at expected scale, and it would buy a privacy promise to word and maintain. Decisive: `/schedule` taking the raw file is **forward-compatible** — an optional `uploadRef` can be added later and omitting clients just re-upload. **Written trigger: files exceeding ~20 locations** (50 stores × ~2 MB × 51 requests ≈ 100 MB of upload is where it starts to hurt); then add the handle, encrypted at rest, single-digit-minute TTL, keyed to the Clerk session so no cross-tenant fetch.

**6. Bounded-concurrency client fan-out, partial success first-class.** Concurrency cap ~4; each location row resolves independently (`pending → done → download` / `failed → reason → retry`); a 10-store chain finishes in ~3 s with the first download at ~1 s. Partial success wins because failures are **genuinely independent** (oversize partition, poisoned rows — all local to one location), all-or-nothing has **no recovery path** (the user cannot fix an oversize store from the client while nine computed schedules are voided), and it is **#06's tiered-error rule one level up** (a bad row poisons an employee-day; a bad location poisons a location). Cost accepted explicitly: the user can walk away with an incomplete set — so the UI owes a **loud, persistent** summary ("8 of 10 locations scheduled. 2 failed — Store 14, Store 22"), not a per-row error that scrolls away.

**7. Exceptions surface in *both* channels, from one array.** Top-level `exceptions` (not buried in `previewJson`) for the operator triaging before download and for the fan-out summary; **and in the xlsx**, because the workbook outlives the session and reaches people who never saw the screen — the scheduler runs the tool, the store manager gets the printout. Today's code is the cautionary case: `ExcelFacade.js:176-178` writes `''` to `REST1`/`MEAL`/`REST2` for an unscheduled employee, **indistinguishable from an employee who needs no breaks**.
   - A poisoned employee-day is a **visible row**, never omitted — name and shift present, break cells carrying the reason ("Cannot comply — no legal placement" / "Overnight — not supported" / "Source row unreadable"). An employee who *vanishes* is one nobody thinks to ask about. Layout has room: the 3 columns (`COL.REST1/MEAL/REST2`) are already being rebuilt to #06's five named slots, and #06's fresh-render decision means we own the grid.
   - **Document-level notices go in the header block**, not the per-employee column — #06's channel is strictly per-employee-day. See the structural finding below.

**8. Both endpoints Clerk-gated; one entitlement helper, validated but permissive.** `/inspect` is included — it parses a customer file (processing their data) and is the cheapest probe surface. On trial gating, #07's "beta is a rollout mode of v1, not a smaller v1" was reconciled with the simplicity principle by a single `requireEntitlement(session)` call at the top of both handlers, reading the Clerk org's subscription state, with one config flag granting everyone during the beta. **The logic is exercised and tested, it just answers permissively** — a few lines, not a subsystem, and the version that goes wrong is the one *added* under pressure on the day charging starts. Explicitly **not** built: the tiered abuse rate-limiter (deferred by #07; the price of opening the invite gate).

**9. Size ceiling — advisory at `/inspect`, binding at `/schedule`, failing one location.** `/inspect`'s `employeeCount` lets the client pre-mark will-fail locations so the user learns up front rather than three minutes into a fan-out; but that is courtesy, not control, since a client can skip `/inspect` entirely and the server trusts nothing from it. Per-location failure follows from decision 6 plus #06's tiered errors rather than being a fresh call. **Consequence for #10:** a tier-3 file that really merged ten stores collapses into one oversize partition and **is caught here** — the ceiling is the detector for the one case decision 2's advisory notice cannot detect. Separately, a plain **request-body guard** (Workers allows 100 MB; real uploads are tens of KB) to refuse the absurd before parsing.

> **Amended by [#10](10-set-per-request-size-ceiling.md).** Two changes. (1) **There is no ceiling** — v1 declares no employee limit, so "pre-mark will-fail locations" client-side is unimplementable as written; the binding guard is a **60 s elapsed-CPU budget** checked between workday partitions, and the advisory is a **server-computed `sizeWarning`** flag added to each `locations[]` entry (threshold = that budget expressed in employees, ~450–500). Computed server-side so it cannot drift out of sync with the actual guard, and so the client ships nothing derived from `core/`. "Courtesy, not control" stands unchanged. (2) The request-body guard is set at **10 MB** with its own distinct wrong-file message — never the too-large-to-schedule copy, which would send the user chasing a multi-location cause for what is a wrong-file problem.

### Structural finding: a document-level notice channel is now needed

#06's exception channel is strictly **per-employee-day**. Two things now need a **per-document** channel: this ticket's tier-3 location notice, and (prospectively) [#11](11-decide-missing-employee-id-fallback.md)'s identity provenance. It is a block, not a single line, and it belongs to whoever assembles the spec rather than to either ticket alone.

### Generated

- **Amendment to [#06](06-design-canonical-model-and-parser-interface.md)** — `Segment.location` + document-level `locationSource`. Recorded there; not a reopening.
- **[#12](12-define-observability-without-pii.md)** (grilling) — what v1 measures and logs, given B1 and that `enableLogging` output is full of employee names and shift times. Load-bearing for the map's new performance principle: "optimise only on confirmed need" requires the confirming data to exist.
- **To [#10](10-set-per-request-size-ceiling.md)** — enforcement point settled (advisory/binding split, per-location failure); its remaining scope is the number, the wording (which must name the merged-multi-location case), and the Workers CPU-limit question.
- **To the Frontend fog** — this is the contract it is written against, plus the fan-out cap, the independent per-location row states, and the loud persistent failure summary.
