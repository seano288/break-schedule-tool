# Define observability without PII

Type: grilling
Status: resolved
Blocked by: 09
Context: spec at `.scratch/saas-v1/specs/12-observability.md`

> **Input from [#10](10-set-per-request-size-ceiling.md).** #10 specifies **what it needs measured and its act-on thresholds**; this ticket owns **the mechanism** — where the numbers land, and who reviews them. Fields (emitted per `/schedule` request by #10's between-partition guard, all aggregate integers — no names, no ids): partition employee count, partition CPU ms, day count, total CPU ms, outcome (`ok` / `budget-exceeded`). Thresholds: **A** — one confirmed-legitimate budget exceedance raises the 60 s budget (n=1, a blocked customer); **C** — p99 partition CPU >20 s or a legitimate location-week >150 s gates `core/` optimisation. Note trigger A requires **confirming a budget exceedance was a single real location**, which no metric can settle alone — so the mechanism needs a path from an anonymous counter to a customer conversation. Also worth capturing: opaque platform kills (error 1102) are invisible to the guard and observable **only** in Workers Logs.

> **Correction from [#11](11-decide-missing-employee-id-fallback.md).** The metric named below as measuring #11's blast radius — **`EMPLOYEE_ID_MISSING` fatal-rejection rate** — no longer exists: #11 accepts id-less files in a degraded name-keyed mode and removes that fatal code. Two metrics replace it, and they now measure *degradation* rather than *rejection*: **`identityKind` distribution** (share of runs on the `ambiguous` name-keyed path — the direct analogue of the `locationSource` distribution already listed) and **`IDENTITY_AMBIGUOUS` exception rate within those runs** (the employee-days actually refused, which is the real customer harm — a name-keyed run with zero ambiguous days cost the customer nothing). Worth noting for the metric-set decision: these two are how anyone would ever learn whether the fallback was a bridge or a permanent route, a question [#13](13-get-anchor-tenant-report-facts.md) can only answer for one tenant.

> **Raised by [#09](09-define-compute-api-surface.md).** The map's performance principle — *design for simplicity, instrument well, optimise only on confirmed need* — is only sound if the confirming data actually gets collected. Nothing on the map currently says what v1 measures. This ticket makes the instrumentation half of that principle real.

## Question

What does v1 log and measure, given B1 forbids retaining employee data — and what is the mechanism that turns a measurement into a decision to act?

## The collision

`core/`'s logging is **not** telemetry: it defaults **on** (`BreakScheduler.js:88`, flagged by [#07](07-decide-infrastructure-stack.md) as a build constraint that must be forced off server-side) and its output is full of **employee names, departments and shift times** — exactly the data [#05](05-draw-ip-protection-cut-line.md)'s B1 posture promises never to retain. #07 also measured that this logging *dominates* runtime, making large runs appear to hang. So the thing currently called "logging" must be off in production, and whatever replaces it has to be built rather than enabled.

The target is **metrics without PII**: counts, durations, sizes, error codes and outcomes — never a name, never a shift time, never a location label that identifies a customer's store.

## To resolve

- **The metric set.** #09 and [#10](10-set-per-request-size-ceiling.md) leave concrete numeric triggers that need a detector: employees per `(location, workday)` partition (the #10 ceiling), locations per upload (#09's **~20-location trigger** for the KV parse handle), compute ms per partition, `/inspect` vs `/schedule` latency, fan-out failure rate per location. Which of these ship in v1?
- **Outcome and error rates**, which double as product signal: fatal rejection rate by code (`FORMAT_UNRECOGNIZED`, `EMPLOYEE_ID_MISSING` — the latter directly measures [#11](11-decide-missing-employee-id-fallback.md)'s blast radius), exception rate by code, `locationSource` distribution (how many customers are on the tier-3 assumed path).
- **Where it lands.** Cloudflare Workers Analytics Engine, Logpush, a third-party, or plain structured console logs. Per the map's infra principle, prefer managed and off-the-shelf; balance operational simplicity against cost.
- **The retention boundary.** How long metrics live and how the retention promise is worded — the [#09](09-define-compute-api-surface.md) data-retention posture allows short-lived encrypted intermediate storage but the customer-facing wording must stay honest.
- **What "confirmed need" looks like operationally.** A trigger nobody reads is not instrumentation. Is there a dashboard, an alert threshold, a periodic review? This is the half of the performance principle most likely to be skipped.
- **Whether `core/`'s existing `enableLogging` path survives at all** in some dev-only form, or is deleted. Note [#01](01-audit-ca-compliance-completeness.md)'s standing caution that edits to the compliance core carry legal risk.

## Answers that change the route

- **Rich telemetry** → a metrics sink is v1 infrastructure with its own config and cost line, and the retention wording grows.
- **Minimal counters** → the numeric triggers in #09 and #10 become manual spot-checks, and the performance principle degrades to "we'll notice when a customer complains" — which should then be stated honestly rather than assumed away.

## Answer

**Rich data, manual review — and the ticket's central premise ("observability *without PII*") was drawn in the wrong place.**

Full schema, runbook and v2 notes: [`specs/12-observability.md`](../specs/12-observability.md).

### 1. The line is not where the ticket put it

The ticket's framing — "never a name, never a shift time, **never a location label that identifies a customer's store**" — silently assumed *anonymous* telemetry, where a store label would de-anonymize. That assumption was wrong on both halves.

**Tenant id and user id are not PII.** They are account identifiers we already store to run auth and billing. Recording them costs the employees — the people B1 actually protects, who never appear in telemetry at all — nothing. And refusing them would have cost a real capability: **[#10](10-set-per-request-size-ceiling.md)'s trigger A is unfireable without them.** Trigger A requires confirming an exceedance was one real location, which no metric settles alone; the mechanism needs a path from a counter to a customer conversation, and tenant id *is* that path. An anonymous-only design would have quietly voided #10's escape hatch — the thing that let #10 ship a 60 s budget instead of a hard ceiling.

Once the tenant is named, **the location label de-anonymizes nothing**, so the ticket's rule had no remaining rationale. Location and department names are both **in**. Workday dates are **out** — the request timestamp already orders events.

The protected surface is therefore the **uploaded schedule content and the result set**, not "anything derived from the file." Standing rule for future fields: a file-derived field ships only with a **named consumer**.

### 2. `core/` needs almost no instrumentation, and the ticket's collision was smaller than it looked

**Every metric is observable at the call boundary.** #10's guard already sits between `scheduleBreaks` invocations; it knows the employee count going in and the elapsed time coming out. So the metric set required *zero* new code inside `core/` — which sidesteps [#01](01-audit-ca-compliance-completeness.md)'s legal-risk caution entirely.

That left only the two channels that already exist, and **the second one was not in the ticket**:

- **`log`** — `console.log`, PII-rich, and **defaults ON** (`BreakScheduler.js:88` reads `!== false`). **Flip the default to `=== true`.** The zero-edit alternative (force `false` at every call site) was rejected: it leaves a landmine where one forgetful call site dumps employee names into Workers Logs with a 7-day tail. The 97 tests in `tests/core/` already pass `enableLogging: false` explicitly and none assert on logging, so the suite is unaffected. Deleting it outright buys no safety the flip does not, and throws away local debugging.
- **`onEvent`** (`BreakScheduler.js:91`) — a pre-existing **structured hook** the ticket did not know about. Pure callback, no I/O; `WizardController.js:487` uses it to animate the preview. Keep it; the server passes none. But its payload carries `name` and `conflictedWith` carries a **second** employee's name (`optimizer.js:126-133`), while its comment reads *"optional instrumentation hook"* — precisely the invitation needed to wire it to the sink and leak every name in the file. **Re-comment as UI-only, PII-bearing, never a telemetry source.**

**Scope clarification from the founder:** #01's caution covers edits to *the algorithm*, not observability. Core edits for instrumentation are permitted; the scheduling math stays untouched.

### 3. Grain is per-partition, forced by trigger C

**One record per `(location, workday)` partition** (~7 per location-week), plus a request-level record.

Trigger C reads *"p99 **partition** CPU"*. A request-grain row collapses that distribution **at write time** and it is not recoverable — a request-grain design would have silently changed what trigger C measures. Rolling partitions up is a `GROUP BY`; the reverse is impossible. Volume is a non-issue (~70 rows per ten-store week against a 250-points-per-invocation cap).

The **request record exists separately** because a request that dies before any partition runs — fatal parse error, oversized body — writes zero partition rows. Denormalizing would have made **every fatal rejection invisible**, and fatal-rate-by-code is a metric this ticket explicitly asks for.

**Departments do not fit the partition grain** (a partition holds many), so they live as a `|`-delimited blob on the `/inspect` request row, where #09 already computes the inventory. Lumpy to query, accepted deliberately: departments have **no named consumer** yet. If one appears, they earn a third dataset then.

### 4. Where it lands

**Analytics Engine** for metrics (3 months) + **Workers Logs** for errors (7 days). Both native Cloudflare, both already paid for by the $5/mo Workers plan — no new vendor, no new cost line, satisfying the map's infra principle.

**Workers Logs alone fails on its own merits:** trigger C needs a p99, which needs aggregation. Workers Logs offers a search box and 7 days; Analytics Engine offers SQL and 3 months. A third-party sink would work and is better at *review*, but adds a vendor, a cost line, and moves customer business data somewhere the promise would have to name.

Workers Logs keeps one specific job: **error 1102 is an uncatchable isolate kill**. No code of ours runs, so it writes no telemetry row — it is visible *only* in platform logs. #10 bounded it to ~1,600 employees in one store-day.

**Index slot = `tenantId`** (Analytics Engine allows exactly one, 96 bytes). Every act-on path ends at a customer, and under sampling the row most needed is a budget exceedance from a *small* tenant — indexed on tenant, that tenant is its own bucket; indexed on anything else, it is the first thing to disappear.

Verified against current docs (2026-08-07): 20 blobs / 20 doubles / **1 index** / 16 KB / **250 data points per invocation** / 3 months. Query via `POST .../analytics_engine/sql` with an **Account Analytics Read** token. Trigger C's query must use **`QUANTILEEXACTWEIGHTED(0.99)(cpuMs, _sample_interval)`** — a naive `quantile()` returns a *wrong* p99 once sampling engages and will not announce it.

### 5. Quality counters — the hole nobody had noticed

Every metric above measures **cost and failure**. None measured whether the output is any **good** — despite the product's entire pitch being that breaks are staggered well.

**`fallbackCount`** (`optimizer.js:52`, currently only a log line) and **`meanShiftMinutes`** (from `onEvent`'s already-computed `shiftedBy`) both ship, per partition. Nearly free — already calculated, and a partition record is already being written.

**Labelled as open product questions, not act-on thresholds.** No trigger reads them; they exist so "is our staggering any good on *real* schedules rather than fixtures" is answerable at all. And explicitly: **a fallback is a quality signal, never a compliance one** — #09 established that meal placement is bounded to its legal window *before* the optimizer runs (`BreakScheduler.js:193-199`). It must not be written down as a compliance metric or someone will later read it as one.

### 6. No automation in v1 — chosen, with the risk named

**No alerts, no cron, no dashboard.** A **`npm run metrics`** script plus a runbook; the founder checks it **daily**.

The proposed automation (trigger A inline via webhook, since it reads a single *event* about a customer blocked right now; trigger C on a weekly Cron Trigger, since it reads a *distribution*) was **deferred to v2**, not rejected — the shape is recorded in the spec.

Daily changes the calculus that made me argue against manual review: trigger A's worst-case lag is ~1 day, acceptable for a blocked customer in an invite-only beta. **The honest risk is not staleness — it is decay**, once the beta stops being the only thing being worked on. That is written on the map rather than assumed away, which is what this ticket asked for.

The script is not an alternative to the runbook; the SQL has to be written down and explained regardless. It exists because **friction, not intent, is what kills a daily habit**.

### 7. Retention and the promise

Retention is **platform-fixed** — 3 months and 7 days — and not ours to set without operating our own storage. What *was* ours is the wording, and #09's posture demands it be honest rather than merely defensible.

**The one-sentence promise everyone assumes — *"your data is never stored"* — is false as written**, because location and department names come out of the customer's file and we keep them for three months. The accurate promise is two sentences: employee data never stored, operational records kept for three months, itemised. Draft copy in the spec; **needs a lawyer before publication.**

**One build constraint fell out:** uncaught exceptions land in Workers Logs for 7 days, so **error messages must never interpolate file content** — `Unparseable row 47`, never `Unparseable row: "Maria Sanchez, 9:00-17:30"`. Codes, row numbers and counts only. This is a rule for the parser and the guard, and it belongs in the spec.
