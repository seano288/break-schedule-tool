# Observability spec — schema, runbook, v2 notes

**Source:** [`#12 Define observability without PII`](../issues/12-define-observability-without-pii.md). Reasoning lives there; this file is the buildable detail.

Nothing here is built. This is spec, written against a system that does not exist yet.

---

## 1. The line

**Not PII, freely recorded:** tenant id, user id. These are account identifiers we already store to run auth and billing.

**Protected, never recorded:** the uploaded schedule content and the computed result set — employee names, shift times, per-employee break placements.

**File-derived but in scope:** location label, department/job names. These are facts about a business, not about an identifiable person.

**File-derived and out of scope:** workday dates. The request timestamp already orders events; the schedule's subject week has no consumer.

**Standing rule for new fields:** a file-derived field ships only with a named consumer. Counts and codes are consumer-driven by construction; free text from the upload earns its place one field at a time.

**Error-message rule:** error messages must never interpolate file content. `Unparseable row 47` — never `Unparseable row: "Maria Sanchez, 9:00-17:30"`. Uncaught exceptions land in Workers Logs for 7 days, so a message that embeds a cell value is a PII leak through the back door. Messages carry codes, row numbers and counts only.

---

## 2. Where it lands

| | Product | Retention | Job |
|---|---|---|---|
| Metrics | **Workers Analytics Engine** | 3 months (fixed) | everything below |
| Errors | **Workers Logs** | 7 days (fixed) | uncaught exceptions, and the **only** place an error 1102 CPU kill is visible |

Both are native Cloudflare, already paid for by the $5/mo Workers Paid plan. No new vendor, no new cost line.

Retention is not configurable on either without adding Logpush + R2, which would mean operating our own storage — rejected against the map's infra principle.

**Why Analytics Engine and not Workers Logs alone:** trigger C reads a p99, which needs aggregation over a window. Workers Logs gives a search box and 7 days. Analytics Engine gives SQL and 3 months.

### Platform limits (verified 2026-08-07 — re-verify before building)

- 20 blobs, 20 doubles, **exactly 1 index** (max 96 bytes) per data point
- 16 KB blob total per data point
- **250 data points per Worker invocation** — a location-week writes ~8, so ~30× headroom
- 3-month retention

---

## 3. Schema

Analytics Engine data points are **positional**. `blobs: [a, b, c]` is queried as `blob1, blob2, blob3`. The ordering below is therefore load-bearing — **append only, never reorder**, or every historical row silently changes meaning.

Both datasets use `tenantId` as the single index. Every act-on path on this map ends in a customer conversation, and the index is the join to it. It is also the key sampling preserves representation across, which matters because the row we would most need is a budget exceedance from one *small* customer.

### Dataset `schedule_requests` — one row per `/inspect` or `/schedule` call

| Slot | Field | Notes |
|---|---|---|
| `index1` | `tenantId` | Clerk org id |
| `blob1` | `endpoint` | `inspect` \| `schedule` |
| `blob2` | `userId` | Clerk user id |
| `blob3` | `requestId` | joins to `schedule_partitions` |
| `blob4` | `presetId` | e.g. `ukg-custom-daily` |
| `blob5` | `locationSource` | `column` \| `header` \| `assumed` (#09 three-tier) |
| `blob6` | `identityKind` | `unique` \| `ambiguous` (#11) |
| `blob7` | `identityLabel` | free text from the parser, e.g. `employee name`, `email` |
| `blob8` | `outcome` | `ok` \| `fatal` \| `partial` \| `budget-exceeded` |
| `blob9` | `fatalCode` | `FORMAT_UNRECOGNIZED` etc., empty when not fatal |
| `blob10` | `departments` | `\|`-delimited inventory, `/inspect` only — see note |
| `double1` | `durationMs` | wall clock |
| `double2` | `locationCount` | `/inspect` only — feeds #09's ~20-location trigger |
| `double3` | `employeeCount` | whole document |
| `double4` | `bodyBytes` | against the 10 MB guard |
| `double5` | `sizeWarning` | 0/1, server-computed (#10 amendment to #09 d9) |

**A request that dies before any partition runs still writes this row.** Fatal parse errors and oversized bodies produce zero partition rows, so without the request record every fatal rejection would be invisible — and fatal-rate-by-code is one of the metrics #12 exists to supply.

**On `departments` as a delimited blob:** a partition is `(location, workday)` and contains many departments, so departments have no natural partition column. `/inspect` is where #09 computes the inventory, so that is where they live. Querying means splitting a string. That is accepted deliberately: departments have **no named consumer** yet. If one appears, they earn a proper shape then — a third dataset, one row per `(request, department)`.

### Dataset `schedule_partitions` — one row per `(location, workday)`

| Slot | Field | Notes |
|---|---|---|
| `index1` | `tenantId` | |
| `blob1` | `requestId` | joins to `schedule_requests` |
| `blob2` | `location` | the store label |
| `blob3` | `outcome` | `ok` \| `budget-exceeded` |
| `double1` | `partitionIndex` | 0-based within the location-week |
| `double2` | `employeeCount` | the number #10's ceiling was never set against |
| `double3` | `cpuMs` | **trigger C reads this** |
| `double4` | `elapsedMsAtCheck` | cumulative, from #10's between-partition guard |
| `double5` | `fallbackCount` | quality — see §5 |
| `double6` | `meanShiftMinutes` | quality — see §5 |
| `double7` | `exc_CANNOT_COMPLY` | |
| `double8` | `exc_OVERNIGHT_UNSUPPORTED` | |
| `double9` | `exc_SOURCE_ROW_UNPARSEABLE` | |
| `double10` | `exc_IDENTITY_AMBIGUOUS` | **#11's blast radius** |

**Grain is per-partition, not per-request, because trigger C reads a p99 over partitions.** A request-grain row collapses that distribution at write time and it is not recoverable. Rolling partitions up to request grain is a `GROUP BY`; the reverse is impossible.

### Emission points

Every metric is observable at the **call boundary**. #10's guard already sits between `scheduleBreaks` invocations and knows the employee count going in and the elapsed time coming out. `core/` emits no telemetry itself, with the single exception of the two quality counters in §5.

---

## 4. `core/`'s two existing channels

**`log` — flip the default to off.** `BreakScheduler.js:88` currently reads `options.enableLogging !== false`, so logging is **on unless a caller opts out**. Output carries employee names, departments and shift times (`:209`, `:414`), and #07 measured that it dominates runtime.

Change to `options.enableLogging === true`. One line, no algorithmic surface. The 97 tests in `tests/core/` already pass `enableLogging: false` explicitly (`BreakScheduler.test.js:19`) and none assert on logging, so the suite is unaffected.

The alternative — leave it and force `false` at every call site — was rejected: it leaves a live landmine where one forgetful call site dumps employee names into Workers Logs with a 7-day tail.

Deleting it outright was also rejected; it is a genuinely useful local debugging tool and removing it buys no safety the default flip does not.

**`onEvent` — keep, re-comment.** It is a pure callback; `core/` does no I/O with it. `WizardController.js:487` uses it to animate the preview. The server passes no `onEvent`.

But its payload carries `name`, and `conflictedWith` carries a **second** employee's name (`optimizer.js:126-133`) — and the comment on `BreakScheduler.js:91` calls it an *"optional instrumentation hook"*, which is exactly the invitation a future developer needs to wire it to the telemetry sink and leak every name in the file.

Re-comment it as **UI-only, PII-bearing, never a telemetry source.**

---

## 5. Quality counters

`fallbackCount` and `meanShiftMinutes` are the only two numbers that measure whether the output is any *good*. Everything else measures cost and failure.

- **`fallbackCount`** — `optimizer.js:52` fires when there is no valid window near the ideal time. Today it only writes a log line.
- **`meanShiftMinutes`** — `onEvent` already computes `shiftedBy` per placement. Aggregate the absolute values.

Both reduce to PII-free aggregates. Both are already calculated; only the aggregation is new.

**These are open product questions, not act-on thresholds.** No trigger reads them. They are here because the product's pitch is that breaks are staggered well, and nothing else on the map would ever tell us whether that is true on real schedules rather than fixtures.

**A fallback is a quality signal, not a legality one.** #09 established that meal placement is bounded to its legal window *before* the optimizer runs (`BreakScheduler.js:193-199`). A high fallback rate means breaks land further from ideal than we would like. It does **not** mean anyone is out of compliance, and it must never be written down as a compliance metric.

---

## 6. The runbook — daily check

There is **no automation in v1**. No alerts, no cron, no dashboard. One person checks these numbers daily.

That is a deliberate choice with a named risk: a daily manual check owned by one person decays once the beta stops being the only thing being worked on. It is the first item in §7.

### Setup, once

1. Cloudflare dashboard → API Tokens → create a token with **Account Analytics Read**.
2. Put it in `.env` as `CF_ANALYTICS_TOKEN`, with `CF_ACCOUNT_ID`.
3. `.env` is gitignored. The token is read-only over analytics; it cannot touch customer data or config.

### `npm run metrics`

One command. Runs the queries below, prints a table, marks anything over threshold. The daily decision is *"is anything flagged"*, not *"let me reconstruct the query."*

The script exists because friction is what kills a daily habit — not intent. It is a thin wrapper; the SQL and its meaning live here.

Endpoint: `POST https://api.cloudflare.com/client/v4/accounts/<CF_ACCOUNT_ID>/analytics_engine/sql`, `Authorization: Bearer <CF_ANALYTICS_TOKEN>`, query in the body.

### Q1 — Trigger A: did anyone hit the 60 s budget?

```sql
SELECT index1 AS tenantId, blob1 AS requestId, blob2 AS location,
       double2 AS employeeCount, double3 AS cpuMs, double4 AS elapsedMsAtCheck,
       timestamp
FROM schedule_partitions
WHERE blob3 = 'budget-exceeded'
  AND timestamp > NOW() - INTERVAL '2' DAY
ORDER BY timestamp DESC
```

**Any row is an act-on event.** #10's trigger A is `n=1` on purpose — a row here is a customer who could not schedule a location.

**What to do:** trigger A requires *confirming the exceedance was a single real location*, which no metric settles alone. Take `tenantId`, find the account, and ask. Two outcomes:

- **It was one real store.** Raise the 60 s budget. #10 says one confirmed case is enough.
- **It was a tier-3 merged file** — several stores collapsed into one partition because the export had no location column. The budget did its job as a **detector**; the fix is the customer's export, not our budget. Cross-check `locationSource = 'assumed'` on the matching request row.

### Q2 — Trigger C: is `core/` actually slow?

```sql
SELECT QUANTILEEXACTWEIGHTED(0.99)(double3, _sample_interval) AS p99CpuMs,
       MAX(double3) AS maxCpuMs,
       COUNT() AS partitions
FROM schedule_partitions
WHERE timestamp > NOW() - INTERVAL '30' DAY
```

```sql
SELECT blob1 AS requestId, index1 AS tenantId, SUM(double3) AS locationWeekCpuMs
FROM schedule_partitions
WHERE timestamp > NOW() - INTERVAL '30' DAY
GROUP BY blob1, index1
ORDER BY locationWeekCpuMs DESC
LIMIT 5
```

**Thresholds (#10):** `p99CpuMs > 20000`, **or** any legitimate `locationWeekCpuMs > 150000`. The second is the real gate — 150 s is half the platform ceiling, the point where "just raise the budget" stops being available.

**Until one fires, there is no `core/` optimisation.** #01 established that edits to the compliance core carry legal risk; a guardrail is far cheaper than a rewrite.

**Use `QUANTILEEXACTWEIGHTED` with `_sample_interval`, not a plain `quantile()`.** A naive quantile returns a *wrong* p99 once sampling engages, and it will not announce that it has.

### Q3 — the ~20-location trigger (#09)

```sql
SELECT MAX(double2) AS maxLocations,
       QUANTILEEXACTWEIGHTED(0.95)(double2, _sample_interval) AS p95Locations
FROM schedule_requests
WHERE blob1 = 'inspect' AND timestamp > NOW() - INTERVAL '30' DAY
```

**Threshold:** approaching ~20 locations per upload means re-upload-per-location is becoming the wrong shape, and #09's deferred KV parse handle is owed. `uploadRef` was designed to be addable later without breaking the contract.

### Q4 — health and degradation

```sql
SELECT blob1 AS endpoint, blob8 AS outcome, blob9 AS fatalCode,
       blob5 AS locationSource, blob6 AS identityKind,
       COUNT() AS n
FROM schedule_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY blob1, blob8, blob9, blob5, blob6
ORDER BY n DESC
```

```sql
SELECT SUM(double10) AS identityAmbiguousDays,
       SUM(double7) AS cannotComplyDays,
       SUM(double8) AS overnightDays,
       SUM(double9) AS unparseableRows
FROM schedule_partitions
WHERE timestamp > NOW() - INTERVAL '7' DAY
```

**What to watch:**

- **`FORMAT_UNRECOGNIZED` rate** — customers whose export we cannot read at all. #06 chose loud rejection; this is the bill for it.
- **`locationSource = 'assumed'` share** — the tier-3 population, the one #09 cannot warn precisely and #10's budget only partly detects.
- **`identityKind = 'ambiguous'` share** *and* **`identityAmbiguousDays`** — #11's blast radius, and the pair that answers whether the name-keyed fallback is a bridge or a permanent route. A name-keyed run with zero ambiguous days cost that customer nothing; the two numbers must be read together, never separately.
- **`cannotComplyDays`** — employee-days the algorithm could not make compliant. Product signal, and a conversation to have with that customer.

### Q5 — quality (no threshold, watch the trend)

```sql
SELECT AVG(double5) AS avgFallbacks, AVG(double6) AS avgShiftMinutes,
       COUNT() AS partitions
FROM schedule_partitions
WHERE timestamp > NOW() - INTERVAL '30' DAY
```

No threshold. Nothing acts on these. They exist so that "is our staggering any good on real schedules" is answerable at all.

### Workers Logs — check when something is unexplained

Error **1102** (CPU limit exceeded) is an **uncatchable isolate kill**. No code of ours runs, so it writes no telemetry row and produces no clean error. It is visible **only** in Workers Logs, and only for 7 days.

Symptom: a customer reports an opaque 5xx that has no matching `budget-exceeded` row. #10 bounded this to roughly ~1,600 employees in a single store-day — absurd enough to be a data error — but it is the one failure the guard cannot see.

---

## 7. v2 notes

Ordered by how likely each is to matter.

1. **Automate the daily check.** The reason v1 is manual is that the beta is small and one person is watching closely. That stops being true. The shape is already clear: trigger A fires **inline** — the same code path in #10's guard that returns the budget error posts a webhook, no query and no lag, because a budget exceedance is a *single event* about a customer blocked right now. Trigger C runs on a **Cron Trigger** weekly and posts only when the threshold is crossed, because a p99 is a *distribution* and means nothing per-event. Silence means nothing fired. Channel: a webhook to wherever you already read things — Cloudflare cannot send outbound email without adding a mail vendor.

2. **A dashboard.** Cloudflare ships **no official Grafana plugin**; the docs point at a third-party **Altinity ClickHouse plugin** configured with the account id and an API token as a custom auth header. It is a real option and it was deferred, not rejected — it adds a vendor account, which was not worth it for a handful of tenants.

3. **Departments get a real shape** if a consumer appears — most plausibly shipping default coverage groups per preset, which would want the actual distribution of department names across tenants. A third dataset, one row per `(request, department)`. Until then the delimited blob is the right trade.

4. **Longer retention** if any question ever needs more than 3 months of history. Requires Logpush → R2 and our own query tooling, i.e. operating storage. Do not do this without a question that demands it.

5. **Per-tenant quality reporting.** If `fallbackCount` and `meanShiftMinutes` turn out to say something useful, they are the seed of a customer-facing "how good was this schedule" view — which is product, not observability, and should be decided as such.

---

## 8. The customer-facing promise

> **We never store your employees' data.** Names, shift times and schedules are processed in memory and discarded as soon as we return your workbook. They are never written to disk.
>
> **We do keep operational records for three months:** which account ran a schedule, which store and which departments it covered, how many people were in it, how long it took, and whether it succeeded.

Two sentences, not one. The single sentence everyone assumes we are making — *"your data is never stored"* — is **false as written**, because location and department names come out of the customer's file and we keep them for three months.

The distinction is defensible on more than rhetoric: California extended CCPA to employee data in 2023, and "personal information" there is information identifying a *person*. "Frontline" and "Store 4021" do not. Employee names would.

**This is draft copy, not final.** A privacy promise should get a lawyer's eye before it is published.
