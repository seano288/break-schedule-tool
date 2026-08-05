# Set the per-request size ceiling and its failure behavior

Type: grilling
Status: open
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
- **Where it is enforced** — at `/inspect` (reject the upload before any compute) or at `/schedule` (reject the one oversized location, let the rest succeed)? This is why it is blocked by [#09](09-define-compute-api-surface.md).
- **The failure mode.** Per #06's tiered errors: is oversize a **fatal upload rejection**, or a per-location failure that poisons only that location? It must not silently truncate — a dropped employee is a missed legally required break.
- **Whether to raise the Workers CPU limit** (30 s default → up to 300 s) as belt-and-braces, and whether that is a config change or a cost change.
- **Whether any of this warrants optimising `core/`.** Default answer: **no** — #01 established that edits to the compliance core carry legal risk, and a guardrail is far cheaper than a rewrite. Optimisation should need a *demonstrated* real-world need, not a benchmark.

## Reproducing

Benchmark harness is throwaway; regenerate by calling `scheduleBreaks(rows, { enableLogging: false })` over synthetic rows. **Logging must be off** — it defaults *on* (`BreakScheduler.js:88`) and dominates the measurement, making large runs appear to hang.
