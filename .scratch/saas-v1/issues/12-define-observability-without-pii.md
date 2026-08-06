# Define observability without PII

Type: grilling
Status: open
Blocked by: 09

> **Input from [#10](10-set-per-request-size-ceiling.md).** #10 specifies **what it needs measured and its act-on thresholds**; this ticket owns **the mechanism** — where the numbers land, and who reviews them. Fields (emitted per `/schedule` request by #10's between-partition guard, all aggregate integers — no names, no ids): partition employee count, partition CPU ms, day count, total CPU ms, outcome (`ok` / `budget-exceeded`). Thresholds: **A** — one confirmed-legitimate budget exceedance raises the 60 s budget (n=1, a blocked customer); **C** — p99 partition CPU >20 s or a legitimate location-week >150 s gates `core/` optimisation. Note trigger A requires **confirming a budget exceedance was a single real location**, which no metric can settle alone — so the mechanism needs a path from an anonymous counter to a customer conversation. Also worth capturing: opaque platform kills (error 1102) are invisible to the guard and observable **only** in Workers Logs.

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
