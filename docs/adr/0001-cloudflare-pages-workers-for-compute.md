# ADR-0001: Cloudflare Pages + Workers for hosting and compute

**Status:** Accepted
**Date:** 2026-08-05
**Deciders:** Founder
**Source:** [`.scratch/saas-v1/issues/07-decide-infrastructure-stack.md`](../../.scratch/saas-v1/issues/07-decide-infrastructure-stack.md) — full reasoning and the rejected alternatives live there.

## Context

The v1 SaaS moves `src/core/` server-side to protect the scheduling algorithm as IP. The server runs the whole pipeline — parse the uploaded workbook, schedule breaks, render a styled workbook — while employee data stays **in memory and is never persisted**. The client is a thin static shell that ships no parser and no `core/`.

Platform research recommended Vercel + Clerk + Stripe for simplicity, with Cloudflare as a cost-optimised runner-up held back by two caveats: a Node-compatibility risk against the "reuse `core/` verbatim" constraint, and auth being a bolt-on. Both caveats collapsed on inspection — the second was never a differentiator (Vercel bolts on the same Clerk), and the first was falsified by measurement (see below).

## Decision

**Cloudflare Pages** for the static client, **Cloudflare Workers** for compute, **Clerk** for auth, **Stripe** for billing.

One compute request covers **one location-week**; the client issues one request per location.

### Why the Node-compatibility risk does not apply

Workers run `workerd` — V8 isolates with Web-standard APIs, **not** Node. That is normally a real risk for "run this code unmodified." It does not bite here, on evidence rather than assumption:

- **`src/core/` is pure ECMAScript.** All 1,210 lines across 6 files import nothing but their own relative modules, and touch no Node or browser globals — no `Buffer`, `process`, `fs`, `require`, `window`, `document`, or `crypto`. It is arithmetic over arrays, strings, `Map` and `Object.entries`, so it behaves identically on Node, `workerd`, Deno, Bun, or a browser.
- **SheetJS already runs in browser V8 today.** The pre-existing SPA parses *and* writes styled workbooks client-side (`src/facades/ExcelFacade.js`) with **zero Node polyfills** — the Vite build injects none. Anything that runs in browser V8 unshimmed runs in Workers V8.
- SheetJS references `fs`, but only inside the `XLSX.readFile`/`writeFile` convenience wrappers. This codebase uses `XLSX.read`/`write` over in-memory bytes — which is also the only thing the never-persist constraint allows.

## Limitations

These are the constraints the platform imposes. **Treat published figures as directional and re-verify against Cloudflare's current docs before relying on any of them.**

### Workers (compute)

| Limit | Value | Headroom for this workload |
|---|---|---|
| **CPU per request (Paid)** | 30 s default, raisable to 300 s | ~1 s per location-week — comfortable |
| **CPU per request (Free)** | ~10 ms | **Unusable.** The $5/mo Paid plan is mandatory, not optional |
| **Memory per isolate** | 128 MB, hard | Not measured under load — see Risks |
| **Bundle size** | 10 MB gzipped (Paid); 3 MB (Free) | ~0.3 MB (SheetJS 225 KB gz + `core/` 60 KB raw) |
| **Startup CPU** | ~400 ms for top-level module evaluation | Fine — no heavy work at import time |
| **Request body** | 100 MB on Free/Pro plans | Workbook uploads are tens of KB |
| **Subrequests** | 1,000 per request (Paid) | Only Clerk/Stripe calls |

Structural constraints that no plan tier removes:

- **No native Node addons, ever.** Any future dependency with a native binding is simply unusable.
- **No filesystem.** Nothing may read or write disk. This happens to align with the never-persist constraint, but it is a hard wall for any library expecting `fs`.
- **`nodejs_compat` is a shim, not Node.** It covers a useful subset (`Buffer`, `path`, `util`, `events`, `stream`, parts of `crypto`). Gaps surface *at runtime*, sometimes only on uncommon code paths.
- **No long-running or background work.** No processes that outlive the response, beyond limited `waitUntil` use.

### Pages (static hosting)

- **20,000 files** per deployment; **25 MiB** per file.
- Build minutes and concurrent builds are capped on the free tier.
- **Direction-of-travel risk:** Cloudflare has been steering new projects toward **Workers Static Assets** rather than Pages. Pages is not deprecated, but it is no longer the recommended default for new builds, so choosing it may mean a migration later. **Verify current guidance before scaffolding** — if Workers Static Assets is the recommended path, prefer it; it also collapses hosting and compute into a single Worker.

### Platform-level

- **Cloudflare Access is not consumer auth.** It is Zero-Trust enterprise gating. Self-serve signup requires a real auth vendor — hence Clerk.
- **Bindings create lock-in.** KV, D1, R2, Durable Objects and the Rate Limiting binding are Cloudflare-specific. Worker *code* stays portable; anything built on bindings does not.
- **Observability is less mature** than incumbent platforms; log retention on Workers Logs is limited.

## Consequences

**Positive**
- ~$5/mo floor versus ~$20/mo for the leading alternative.
- Effectively zero cold start — isolates, not container boots.
- A 100 MB request body versus 4.5 MB on the main alternative. This product's entire input is file uploads, so the tighter ceiling would have been the one to bind.
- The deferred abuse-limiter lands natively later: the Rate Limiting binding and KV are in-pane and included, where the alternative needed a fourth vendor.

**Negative / accepted**
- **Residual runtime risk is future-shaped.** Not `core/` and not SheetJS — both verified — but any dependency added later that needs real Node or a native addon. **Accepted knowingly**: the escape hatch is porting the Worker to a real-Node host, which is tractable precisely because `core/` is pure.
- The Paid plan is required from day one; the free tier's ~10 ms CPU cannot run this workload.
- Some lock-in via Cloudflare-specific bindings if adopted.

## Build notes

- Enable the **`nodejs_compat`** flag so SheetJS's unused `fs` reference resolves harmlessly.
- **Force `enableLogging: false`.** `scheduleBreaks` reads `options.enableLogging !== false` (`src/core/BreakScheduler.js:88`), so logging is **opt-out** and defaults *on*. Left on, it emits thousands of `[EVAL]` lines per request; during benchmarking it was slow enough to make a 1000-employee run appear to hang.
- Keep the per-request size guardrail in mind: `core/` is **~O(n²·³)** in employees per invocation. The location-week granularity is what keeps this safe, and it is a load-bearing part of this decision rather than an incidental choice. The ceiling itself is still open — see `.scratch/saas-v1/issues/10-set-per-request-size-ceiling.md`.

## Risks to retire

- **Memory has not been measured.** The 128 MB isolate limit was reasoned about, not tested, against a SheetJS parse plus a styled write. Measure with a realistic location-week workbook before committing production traffic.
- **Verify the Pages vs. Workers Static Assets question** before scaffolding the client.
