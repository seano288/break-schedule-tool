# Set the per-request size ceiling and its failure behavior

Type: grilling
Status: resolved
Blocked by: 09

> **Raised by [#07 infrastructure stack](07-decide-infrastructure-stack.md),** which measured `src/core/` while sizing the compute workload.

## Question

What is the maximum schedule size v1 accepts in one compute request, and what happens to a request above it?

## The measurement

`scheduleBreaks` is **~O(n²·³) in employees per invocation** — superlinear, and the exponent worsens with n. Measured on the current `src/core/` with logging disabled, synthetic single-day schedules:

| employees in one call | 6 depts | ~20/dept | ~5/dept |
|---|---|---|---|
| 50 | 90 ms | — | — |
| 200 | 1.27 s | — | — |
| 500 | 11.0 s | 6.8 s | 5.1 s |
| 1000 | 71.5 s | 35.9 s | 25.5 s |

Spreading employees across departments is only a **constant factor** (~2–2.8×), not a change in growth — 1000 employees over 200 departments still takes 25 s. **Total employees per invocation drives the cost.**

## Why this is not yet a crisis

[#07](07-decide-infrastructure-stack.md) chose **one request = one location-week**, and `core/` partitions to `(location, workday)` internally, so a realistic store-day (~60 employees) is **~130 ms**. Nothing binds at expected scale, and this is *why* the Workers 30 s CPU ceiling was judged safe.

**But the guardrail is unspecified**, and the curve is steep enough that the gap between "fine" and "times out" is narrow: ~500 employees on a single store-day is ~5–11 s, and ~1000 is 25–71 s against a 30 s default CPU limit. An unusually large flagship store, a distribution centre, or a malformed file that collapses many locations into one partition could reach it.

## To resolve

- **The ceiling itself.** Max employees per `(location, workday)` partition. What is the largest *real* store-day, and what multiple of it is the limit?
- ~~**Where it is enforced**~~ — **settled by [#09](09-define-compute-api-surface.md):** advisory at `/inspect` (which returns `employeeCount` per location, so the client can pre-mark will-fail locations before committing to a fan-out) and **binding at `/schedule`**, evaluated against the partition the server just built. The `/inspect` report is courtesy, not control — a client can skip it, and the server trusts nothing from the client.
- ~~**The failure mode**~~ — **settled by [#09](09-define-compute-api-surface.md):** oversize fails **one location**, not the upload. Follows from #09's partial-success fan-out plus #06's tiered errors (a bad row poisons an employee-day; a bad location poisons a location). Still standing: it must not silently truncate — a dropped employee is a missed legally required break.
- **The rejection wording**, which now carries a second job. #09 added `location` to the canonical model with **three-tier sourcing**; a tier-3 file (no location column, e.g. a UKG report run for "All Home Locations") that really spans ten stores collapses into **one oversize partition** — so this ceiling is the **only detector** for the case tier 3's advisory notice cannot see. The message must therefore name it: *"…this can also mean your export spans multiple locations without a location column."*
- **Whether to raise the Workers CPU limit** (30 s default → up to 300 s) as belt-and-braces, and whether that is a config change or a cost change.
- **Whether any of this warrants optimising `core/`.** Default answer: **no** — #01 established that edits to the compliance core carry legal risk, and a guardrail is far cheaper than a rewrite. Optimisation should need a *demonstrated* real-world need, not a benchmark.

## Reproducing

Benchmark harness is throwaway; regenerate by calling `scheduleBreaks(rows, { enableLogging: false })` over synthetic rows. **Logging must be off** — it defaults *on* (`BreakScheduler.js:88`) and dominates the measurement, making large runs appear to hang.

## Answer

**There is no ceiling. There is a time budget, and it exists because the platform will not give us a good error message for free.**

The ticket asked for a maximum employee count. The answer is that v1 declares none — nothing is rejected for being large — because any number we picked now would be a guess, and a wrong guess rejects work that would have succeeded. What v1 ships instead is a guard that converts an unsurvivable platform failure into a truthful message, plus the instrumentation to set a real ceiling later if one is ever owed.

### 1. Why "no check, just fail with a good message" needed a check anyway

The intuition — let it fail, explain it, measure, revisit — is the map's performance principle applied correctly, and it is what v1 does. But two Workers facts mean it cannot be implemented by doing nothing:

- **A CPU-limit kill is uncatchable.** Exceeding the limit terminates the isolate (error 1102). No `try`/`catch`, no `finally`, no hook. The client gets an opaque 5xx, *not* a message. So "fail with a good message" is precisely the thing the platform refuses to do.
- **You cannot time your own compute.** Workers freezes the clock during synchronous execution as a timing-attack mitigation — `Date.now()` advances only after I/O. The obvious "check elapsed, bail out" guard therefore **silently never fires** in a pure-compute loop.

Both are load-bearing and both are **verify-on-first-deploy**.

### 2. The guard: yield between workdays, 60 s budget

`core/` partitions to `(location, workday)` internally (#06 decision 1), so a location-week is ~7 sequential invocations. Between each one, `await` a zero-delay timer — that I/O unfreezes the clock — then compare elapsed against a **60 s budget**. Over budget fails **that location** cleanly (#09 decision 9's per-location failure). Cost: ~7 yields per location-week.

This needs **no calibrated constant and no guessed ceiling**, and the same measurement *is* the metric §5 requires — so "collect data now, decide later" arrives free rather than as separate work.

Rejected alternatives: **predict cost before computing** from the O(n²·³) curve (needs a calibrated constant that drifts with hardware — the guessed number we were avoiding); **nothing server-side, client says "may be too large" for any opaque failure** (simplest, but blames size for every genuine bug — the shape of #01's "compliance veneer over a subtle error").

### 3. `limits.cpu_ms = 300000`, and why the budget is *not* set near it

Raising the Workers CPU ceiling 30 s → 300 s is a **config change, not a cost change**: Workers Paid bills CPU actually consumed (~$0.006 for a full 300 s runaway), so it raises the worst case we could be billed for, never the floor.

The budget is nonetheless sized to **the largest plausible real location-week, not to the platform ceiling** — because for a tier-3 file **succeeding is worse than failing**. Coverage groups key on `dept`/`job`, so ten merged stores' `Frontline/Cashier` become one pool and breaks get staggered between employees in different buildings: a workbook that looks correct and is not. #09 rated that a quality degradation deserving an advisory notice; at ten-store scale it is junk output. A 300 s budget would grind for ~105 s and then hand back that junk. **The budget is the detector #09 said this ticket had to supply** for the one case tier-3 sourcing cannot see, and setting it low is what makes it one.

| Request | Busiest day | Location-week |
|---|---|---|
| 60 employees/day (typical) | ~130 ms | ~0.9 s |
| 200/day (large flagship) | ~1.27 s | ~9 s |
| 500/day | ~5–11 s | ~35–75 s |
| 600/day (≈10 stores merged) | ~15 s | ~105 s — **caught** |

The 60 s ÷ 300 s gap also **bounds the residual hole** rather than merely accepting it. The guard only checks *between* workdays, so a single monstrous partition could still exceed the platform limit uncaught — but with 60 s spent and 240 s remaining, that partition would have to take 240 s alone, i.e. **~1,600 employees in one store-day**. The only case that still yields an opaque 1102 is one absurd enough to be a data error, and it is visible in logs.

**Recorded assumption:** 60 s assumes the largest real store-day is **≲200 employees**. This fact was not confirmed during resolution. Trigger A (§5) is what falsifies it.

### 4. The advisory, the body guard, and the copy

**Advisory — server-computed, amending [#09](09-define-compute-api-surface.md) decision 9.** #09 said `/inspect` lets the client "pre-mark will-fail locations"; that is unimplementable as written once no ceiling exists. It returns instead a per-location **`sizeWarning`** flag computed server-side, alongside the existing `employeeCount`. The threshold is not a new number — it is **the 60 s budget expressed in employees** (~450–500 at 7 days). One budget, two expressions: predictive at `/inspect`, actual at `/schedule`. Server-side because (a) the threshold gets refit as real timings arrive and a client copy would drift out of sync with the actual guard, needing a client deploy to correct; (b) it keeps the client shipping nothing whatever derived from `core/`, sidestepping the cut-line debate whether or not a cost curve counts as rule logic. Still **courtesy, not control** — the client may fan out anyway and `/schedule` trusts nothing sent to it. `employeeCount` is displayed alongside because a manager who knows their store has 60 people recognises "1 location — 612 employees" instantly.

**Body guard: 10 MB**, pre-parse, binding at both endpoints (#09 called for this and left the number open). Workers permits 100 MB and real exports are tens of KB, so 10 MB is ~1,000× typical — it cannot bind on a legitimate file, and it stops a 60 MB image-laden workbook being parsed into memory on a compute-billed request. **Its own distinct message**, never the too-large-to-schedule copy: a 40 MB upload is a wrong-file problem, and sending that manager to adjust their Hyperfind is exactly the false diagnosis this copy is designed to avoid.

**The copy.** `/schedule` failure:

> **Building 2 — too large to schedule.** This location's week covers 612 employees, more than one request can process. **Nothing was scheduled for this location**; your other locations are unaffected. If Building 2 shouldn't have 612 employees, your export probably covers several stores with no location column to tell them apart — re-run it for one store at a time (in UKG, narrow the **Hyperfind** to a single location rather than "All Home Locations"), or ask your admin to add a location column.

`/inspect` advisory:

> **Building 2 — 612 employees.** This may be too large to schedule. If that count looks wrong for this store, your export may cover several stores under one label.

Body guard:

> **This file is too large to read (10 MB limit).** Check you're uploading the schedule export rather than a full workbook.

Three deliberate properties: (1) **leads with the size fact, not the diagnosis** — the multi-location cause is only sometimes true, so it is conditioned on "if that number looks wrong" rather than asserted, the same truthfulness constraint that ruled out option C in §2; (2) **"Nothing was scheduled for this location" is explicit**, discharging the no-silent-truncation requirement in copy — necessary because #06 established a *different* failure shape elsewhere (a poisoned employee-day is a visible row), so the user must be told this one is all-or-nothing; (3) **the remediation hint is preset-scoped**, living in the UKG parser module — #08 established UKG run params are Timeframe / Hyperfind / Output-Format, making Hyperfind precisely the control that produces the "All Home Locations" merge. This **extends [#06](06-design-canonical-model-and-parser-interface.md) decision 5**: a parser module now also owns its user-facing remediation copy, and each future preset supplies its own.

### 5. Deferred, with written triggers

Emitted per `/schedule` request by the §2 guard: partition employee count, partition CPU ms, day count, total CPU ms, outcome (`ok` / `budget-exceeded`). All aggregate integers — **no names, no ids, B1-safe by construction**.

- **Trigger A — raise the 60 s budget:** *one* budget-exceeded event the customer confirms was a single real location. Deliberately n=1: that is a blocked paying customer and a falsified ≲200 assumption, not a benchmark.
- **Trigger C — optimise `core/`:** p99 partition CPU >20 s, **or** any legitimate single location-week >150 s. The second is the real gate — 150 s is half the platform ceiling, the point where "just raise the budget" stops being available. **Until one fires, no `core/` optimisation**, which is this ticket's last open item: #01 established that edits to the compliance core carry legal risk, and a guardrail is far cheaper than a rewrite.

Two further triggers were drafted and **deliberately dropped** as review hygiene rather than written triggers: refitting the `sizeWarning` constant when flagged-vs-actual disagrees on >20% of flagged locations, and declaring a hard employee ceiling if opaque platform kills exceed 0.1% of `/schedule` requests.

**#10 owns the fields and thresholds; [#12](12-define-observability-without-pii.md) owns the mechanism** — where the numbers land and who reviews them.
