# Decide the infrastructure stack

Type: grilling
Status: resolved

## Question

Which concrete hosting + auth + billing bundle does v1 deploy on? Turn the platform-landscape research (#03) into a committed choice, now that the client/server cut-line (#05) has fixed the runtime requirements.

Research #03 recommended **Vercel + Clerk + Stripe** (simplicity, ~$20/mo floor), runner-up **Cloudflare Pages + Workers + Clerk + Stripe** (~$5/mo, with Node-compat + bolt-on-auth caveats), and flagged traps (Vercel free tier bans commercial use; Supabase forces ~$25/mo; Netlify Identity deprecated; Cloudflare Access ≠ consumer signup; Azure/AWS cheapest-but-most-complex). This ticket *decides*.

**Requirements the stack must satisfy (from #05 cut-line):**
- Real-Node serverless compute that runs `src/core/` **verbatim** (no port), alongside the xlsx read/write toolchain — the whole parse → schedule → render pipeline is server-side.
- Employee data processed **in-memory only, never persisted** (B1). No database required for the compute path.
- **Auth-gated** compute endpoint with **self-serve signup** and a **14-day no-card trial** (from #04 pricing).
- **Tiered per-account abuse rate-limiting** (trials tighter than paid) + **anomaly logging** on the compute endpoint (from #05) — an abuse ceiling, *not* a usage quota (runs are unlimited/uncharged per #04).
- **Stripe** billing: one `per_unit` recurring price (quantity = locations), monthly + discounted annual, trial with no payment method up front, self-serve quantity control (from #04).
- Hosts a thin static client (from #05 / Frontend-architecture constraint).

Resolve via `/grilling` + `/domain-modeling`: confirm or override the #03 recommendation against these hardened requirements — in particular validate the Cloudflare Workers **Node-compat** caveat against "run `core/` verbatim," and settle whether the ~$15/mo simplicity premium of Vercel is worth it at this stage.

Deliverable: the committed hosting + auth + billing bundle, recorded as the constraint the billing-config and frontend-architecture tickets build against.

## Answer

**Committed stack: Cloudflare Pages + Workers + Clerk + Stripe-as-assumed-rail.**
Hosting/compute and auth are *decided*; the billing **provider** is deliberately **not** decided here (see 4 below).

### 1. Hosting + compute: Cloudflare Pages + Workers

Research #03 ranked Cloudflare highest on composite (4.5 vs Vercel's 4.0) but held it as runner-up on two caveats. **Both collapsed under measurement**, so the research's own reasoning points to its runner-up.

**Caveat 1 — "Node-compat fidelity risk vs. run `core/` verbatim" — falsified.** This was the load-bearing objection, because if Workers couldn't run `core/` we'd be forced to modify the exact asset #05 protects and #01 found bugs in.

- `src/core/` (1,210 LOC, 6 files) imports **nothing** but its own relative modules. `grep -rE "Buffer|process|fs|require|window|document|crypto|Intl|Date"` over `src/core/` returns **only prose inside comments**. It is arithmetic over arrays/strings/`Map`/`Object.entries` — plain ECMAScript, identical on Node, `workerd`, Deno, Bun, or a browser.
- The only other server-side dependency is **SheetJS**, and the decisive evidence is not a spec claim: **it already runs in browser V8 today.** The current SPA parses *and* writes styled workbooks client-side (`src/facades/ExcelFacade.js:220`, `cellStyles: true`) with **zero Node polyfills** — `vite.config.js` injects nothing and `@rollup/plugin-inject` is an unused leftover dependency. What runs in browser V8 with no shims runs in Workers V8.
- SheetJS *does* reference `fs`, but only inside `XLSX.readFile`/`writeFile`. We use `XLSX.read`/`write` over in-memory bytes — which is also the only thing **B1** permits, since nothing may touch disk.

**Caveat 2 — "auth is a bolt-on" — not a differentiator.** Vercel bolts on the same Clerk. Research #03 says so itself. This never distinguished the two.

**Every Workers ceiling measured, with room to spare:**

| Ceiling | Limit | Our load |
|---|---|---|
| Runtime fidelity | `workerd` V8 | pure V8 code, proven in-browser |
| Bundle size | 10 MB gz (3 MB free) | ~0.3 MB gz (`xlsx.mjs` 225 KB gz + `core/` 60 KB raw) |
| CPU / request | 30 s default (raisable to 300 s) | ~1 s at location-week granularity |
| Request body | 100 MB | xlsx export, tens of KB |
| Durable state | — | none required in v1 (see 3) |

**Deciding reasons over Vercel:** 4× cheaper ($5 vs $20/mo floor) against a criterion that weighs cost explicitly; the **deferred abuse-limiter lands natively later** (Workers Rate Limiting binding + KV, in-pane and included, where Vercel needs a 4th vendor such as Upstash) — the one piece of *known* future work is cheaper here; and a **100 MB vs 4.5 MB** request-body limit, which is the tighter ceiling on Vercel and this product's entire input is file uploads.

**Accepted trade:** Vercel's real Node is insurance against a *future* dependency — not `core/`, not SheetJS, both verified. Judged not worth ~$180/yr given the core is pure arithmetic. **Residual risk is future-shaped, and it is accepted knowingly.**

**Build note:** enable the `nodejs_compat` flag so SheetJS's unused `fs` reference resolves harmlessly.

### 2. Auth: Clerk

Satisfies the requirement derived in this session that the **invite-only beta and self-serve GA be the same build** — Clerk's Restricted sign-up mode + invitations make the gate a dashboard toggle, not a rebuild. Its **organizations** model also matches the #04 buyer (a chain with several managers on one account).

**Named risks:** auth is the stickiest lock-in in the stack — leaving later means exporting password hashes or forcing resets. Clerk's free-tier ceiling (~50k MAU per #03) and branding-removal terms move; **verify at signup rather than trusting the research figure.**

### 3. Abuse-limiter: deferred to a GA backlog item

**v1 rolls out as an invite-only beta**, so the vetted-invite gate *is* the v1 mitigation for the bulk-extraction risk #05 accepted. The tiered per-account rate-limiter + anomaly logging is deferred — **but it is the price of opening the gate, not an optional nice-to-have.** #05 is re-based, not reopened.

Consequence for this decision: with no counters in v1, **no durable state substrate is required**, so the platform comparison scored hosting + compute + auth + billing only. Cloudflare's native Rate Limiting binding + KV make the deferred work cheap to land later.

### 4. Billing: **Stripe** (decided)

> **Amended.** This section originally deferred the provider to the billing ticket, with the analysis below leaning Paddle on tax grounds. **The founder decided Stripe**, so the provider is settled here and only the *config* graduates. The analysis is kept because it records the trade knowingly accepted.

**Consequence of choosing Stripe over an MoR:** the company is **merchant of record** and therefore **owns US multi-state SaaS sales-tax registration and remittance**. Stripe Tax *calculates* (~0.5%); it does not register or file for you. Economic-nexus thresholds mean selling to chains can create filing obligations in states the business has no physical presence in. This obligation does not bite during the invite-only beta (billing ships **dormant**, no revenue), but it must be discharged **before the first real charge** — tracked in the map's fog as owed work, not left implicit.

**What this buys:** ~3.6% + 30¢ all-in vs Paddle's ~5% + 50¢ (a ~$56/yr saving at $500/mo), full flexibility over the #04 `per_unit` quantity model, the largest integration/example corpus, and access to the **ACH lever** (0.8%, capped at $5 — $4.00 vs $14.80 on a $500 charge, with the cap widening the gap as accounts grow). An MoR has no equivalent escape hatch.

*Original analysis, retained:*

**The billing provider does not affect the platform choice** — every candidate hosts a webhook endpoint equally well (#03 called Stripe "close to a constant"). Billing also ships **dormant** during the beta. So deciding it here would be scope creep; it graduates as its own ticket, with this session's analysis handed forward:

- **Stripe all-in ≈ 3.6% + 30¢** (2.9% + 30¢ processing, +0.7% Billing, +0.5% optional Tax). No monthly floor.
- **Paddle (merchant of record) ≈ 5% + 50¢**, and it absorbs multi-state SaaS sales-tax registration and remittance.
- **Modelled at $50/location × 10 locations = $500/mo: Stripe ~$20.80 vs Paddle ~$25.50 — a ~$4.70/mo delta (~$56/yr)** to make US multi-state SaaS tax someone else's legal problem. Economic-nexus thresholds can create filing obligations in states never visited. **The tax argument is strong enough that the billing ticket should lean Paddle.**
- **Margin lever:** ACH at **0.8% capped at $5** vs 2.9%+30¢ on cards — $4.00 vs $14.80 on a $500 charge, and the cap widens the gap as accounts grow. Paddle's flat 5% has no equivalent escape hatch, which narrows the delta at larger accounts.
- **Clerk Billing** (built *on* Stripe, so it competes with Stripe Billing, **not** with Paddle — it does nothing for tax): collapses the webhook→entitlement glue into `has({ plan })`. **But its per-seat automation bills against organization *members*, and #04's value metric is self-declared *locations*, which are not members** — a 10-location chain may have 3 logins. Whether it supports arbitrary quantity decoupled from member count is **unverified and must be checked before it is counted on.** Also compounds lock-in onto the auth vendor.

*(Percentages are directional; published rates move.)*

### Constraint handed to the build

**`enableLogging` defaults ON** — `BreakScheduler.js:88` reads `options.enableLogging !== false`, i.e. opt-*out*. In a serverless function this emits thousands of `[EVAL]` lines per request. It is also not merely noisy: it was slow enough to make a 1000-employee benchmark appear to hang until logging was disabled. **Must be explicitly set `false` server-side.**

### Raised by this ticket

- **[#09 Define the compute API surface](09-define-compute-api-surface.md)** — Q3's location-week granularity collides with #05's thin client: the client uploads the raw file and ships no parser, so it **cannot know which locations the file contains**. Forces a two-endpoint shape.
- **[#10 Set the per-request size ceiling](10-set-per-request-size-ceiling.md)** — measured `core/` at ~**O(n²·³)** in employees per invocation.
