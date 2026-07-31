# Research: Managed-platform landscape (hosting + auth + billing bundles)

**Ticket:** `.scratch/saas-v1/issues/03-research-managed-platform-landscape.md`
**Type:** research — *informs but does not decide* (the Infrastructure-stack decision is a separate, later ticket)
**Date:** 2026-07-31
**Governing criterion (from founder):** balance deployment/operational **simplicity** against **cost**. Explicitly avoid the "Azure trap" — cheap compute but you hand-assemble static hosting + tables + functions + auth + monitoring as separate pieces.

---

## Workload shape (what we're actually placing)

- **Compute:** one stateless, compute-only Node/TS serverless endpoint. A schedule is POSTed, `src/core/` runs in memory, the result returns, input is discarded. **No app database, no persistence, no long-running state.** The only stateful things are auth (managed) and billing (managed).
- **Frontend:** greenfield SPA (static assets + client JS). Needs static hosting + CDN.
- **Auth:** self-serve signup (public consumer-style sign-up, not enterprise SSO gating).
- **Billing:** Stripe subscriptions (self-serve checkout + webhook to flip entitlement). Stripe is the assumed billing rail in every bundle, so it is close to a constant.
- **Reuse constraint:** `src/core/` moves server-side and is reused **verbatim, no port** — so the compute runtime's Node-fidelity matters.

Because there is **no app database**, the classic "you also have to run Postgres" cost/complexity line largely disappears. That materially changes the comparison: the DB-centric platforms (Supabase) lose one of their main advantages here, and the pure static-host + function platforms look better than they would for a stateful app.

---

## The bundles

### 1. Vercel + Clerk + Stripe

- **Pieces to wire/monitor:** 3 vendors (Vercel = static hosting + CDN + Node functions + built-in observability in one pane; Clerk = auth; Stripe = billing). Hosting and compute are a *single* deploy/dashboard — no separate API-gateway/monitor assembly.
- **Cost curve (zero → first customers):** Vercel **Hobby is free but non-commercial** — a revenue-generating SaaS must be on **Pro at $20/developer seat/mo** (includes $20 usage credit, commercial use, 300 s function timeout). Clerk free to **~50,000 monthly retained users** (raised Feb 2026). Stripe pay-as-you-go, no floor. **Practical floor ≈ $20/mo.**
- **SPA + compute fit:** Best-in-class. SPA + serverless Node function in one repo, one deploy. Functions run **real Node** → honors "reuse core verbatim, no port."
- **Auth ergonomics:** Clerk is the gold standard for self-serve signup — drop-in prebuilt sign-up/sign-in components, hosted flows, minimal glue.
- **Stripe ease:** Very easy; huge example corpus; Clerk also offers a Stripe-backed billing layer if desired.
- **Lock-in:** Moderate. Node functions are portable; Clerk auth is proprietary (real switching cost); SPA is portable.
- Sources: [Vercel pricing summary](https://comparedge.com/tools/vercel/pricing), [Vercel free-tier limits](https://blog.vibecoder.me/vercel-pricing-explained-when-free-isnt-enough), [Clerk 50k free change](https://saasprices.net/blog/clerk-free-plan-changes), [Clerk pricing](https://clerk.com/pricing).

### 2. Netlify + (Auth0 or Supabase Auth) + Stripe

- **Pieces to wire/monitor:** 3 vendors, but note **Netlify Identity is deprecated** (frozen, security-only patches; Netlify now steers new sites to the official **Auth0 extension** or **Supabase Auth**). So auth is a **bolt-on third party**, same as Vercel — Netlify is not a more-integrated auth story.
- **Cost curve:** Netlify Free = **300 credits/mo** (each credit now buys less after the Sept 2025 repricing: bandwidth 20 credits/GB, compute 10 credits/GB-hr). Personal $9, Pro $20. Auth0 free to **25,000 MAU**. **Practical floor ≈ $0–9/mo** at trivial volume, rising as credits deplete.
- **SPA + compute fit:** Good; SPA + Netlify Functions (real Node) in one deploy, comparable to Vercel.
- **Auth ergonomics:** Auth0 is heavier/enterprise-flavored to wire than Clerk; Supabase Auth is lighter. Either way it's an extra vendor.
- **Stripe ease:** Fine (function-hosted webhooks).
- **Lock-in:** Moderate, similar to Vercel.
- Sources: [Netlify pricing 2026](https://costbench.com/software/cloud-infrastructure/netlify/), [Netlify: Auth0 extension & Identity changes](https://www.netlify.com/blog/auth0-extension-identity-changes/), [Auth0 free 25k MAU](https://auth0pricing.com/).

### 3. Azure Static Web Apps + Functions + Entra External ID + Stripe  ← the named "trap"

- **Pieces to wire/monitor:** 4–5. Static Web Apps (hosting) + integrated Azure Functions (compute, billed separately at Consumption rates) + Entra External ID tenant (auth) + App Insights/Monitor (observability is a separate service you stand up) + Stripe. SWA *does* offer built-in auth binding to Entra/social, which helps, but the overall footprint is the multi-piece assembly the founder flagged.
- **Cost curve:** Cheapest raw compute. SWA Free tier (100 GB bandwidth); Functions Consumption **1M requests + 400k GB-s free/mo**; Entra External ID **free to 50,000 MAU** ($0.03/MAU after). **Practical floor ≈ $0**, or $9/mo for SWA Standard (SLA). Cheapest at the meter.
- **SPA + compute fit:** SWA is purpose-built for SPA + integrated Functions API and runs **real Node** — technically a good fit. The friction is assembly/DX, not capability.
- **Auth ergonomics:** Entra External ID means standing up an external tenant + user flows — enterprise-grade but the **heaviest** self-serve-signup setup here; least "drop-in."
- **Stripe ease:** Works, but the smallest turnkey-example ecosystem of the six.
- **Lock-in:** Functions programming model + Entra are Azure-specific; higher operational lock-in.
- Sources: [Azure SWA pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/static/), [Azure Functions pricing](https://azure.microsoft.com/en-us/pricing/details/functions/), [Entra External ID pricing (50k free)](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing).

### 4. AWS Amplify/Lambda + Cognito + Stripe

- **Pieces to wire/monitor:** 4–5. Amplify (static hosting) + Lambda + (usually) API Gateway + Cognito (auth) + CloudWatch (monitoring) + IAM glue + Stripe. Even with Amplify Gen 2 bundling, AWS is inherently the most moving parts.
- **Cost curve:** Generous free tiers — Lambda 1M req/mo free; **Cognito Essentials free to 10,000 MAU** then $0.015/MAU. **Practical floor ≈ $0**, cheap at the meter.
- **SPA + compute fit:** Amplify hosts the SPA, Lambda runs **real Node** — capable, but the most glue (API Gateway, IAM roles) to reach a working endpoint.
- **Auth ergonomics:** Cognito is functional but has the **roughest DX** here (dated hosted UI, and the new Lite/Essentials/Plus tiering adds pricing complexity).
- **Stripe ease:** Fine.
- **Lock-in:** Highest — IAM, Amplify constructs, Cognito. Lambda code itself is portable.
- Sources: [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/), [Cognito new pricing analysis](https://www.thestack.technology/awss-new-cognito-pricing-complicated-potentially-costly/).

### 5. Supabase (Auth + Edge Functions) + Stripe

- **Pieces to wire/monitor:** 2 vendors on paper (Supabase = auth + edge functions + monitoring in one dashboard; Stripe). **But** Supabase does **not host the SPA frontend** — you still pair it with a static host (Cloudflare Pages / Vercel / Netlify), so realistically **3 pieces**.
- **Cost curve:** Free tier is generous (50k MAU, 500k edge invocations) **but free projects pause after 7 days of inactivity — unusable for production.** So production ⇒ **Pro at $25/mo** (bundles auth + edge functions + the unused Postgres). **Practical floor ≈ $25/mo** — the highest floor of the six, and we'd be paying for a database this compute-only workload doesn't use.
- **SPA + compute fit:** Edge Functions run **Deno**, not Node. Our pure-algorithm TS core should run, but this is a **deviation from the "Node/TS, reuse verbatim, no port" constraint** and needs validation. Frontend must be hosted elsewhere.
- **Auth ergonomics:** Supabase Auth is strong for self-serve signup (prebuilt UI, good value), a notch below Clerk on polish.
- **Stripe ease:** Good — documented Stripe patterns/wrappers.
- **Lock-in:** Moderate (auth + Deno edge runtime), code mostly portable.
- Sources: [Supabase pricing/free-tier & pause](https://uibakery.io/blog/supabase-pricing), [Supabase pricing breakdown](https://makerkit.dev/blog/saas/supabase-pricing).

### 6. Cloudflare (Pages + Workers) + [bolt-on auth] + Stripe

- **Pieces to wire/monitor:** Pages (static) + Workers (compute) are **one platform, one pane** — the tightest hosting+compute integration of all six. **Caveat: Cloudflare Access is Zero-Trust/enterprise gating, NOT consumer self-serve signup** — it's the wrong tool for public sign-up. So you bolt on an auth vendor (Clerk / Auth0 / Supabase Auth / better-auth). Realistically **3 vendors** (Cloudflare + auth + Stripe).
- **Cost curve:** **Cheapest floor.** Free plan = 100,000 requests/day; Workers Paid = **$5/mo** (no daily cap, 10M requests included). With Clerk free to 50k users, **practical floor ≈ $5/mo.**
- **SPA + compute fit:** Pages + Workers is native and excellent (one deploy). **Caveat:** Workers run on V8 isolates (`workerd`), not full Node — needs `nodejs_compat`. A pure compute-only algorithm very likely runs unmodified, but it's a **runtime-fidelity risk** against "no port" that must be validated.
- **Auth ergonomics:** No native consumer auth → bolt-on (Clerk gives Vercel-grade ergonomics here).
- **Stripe ease:** Fine (Worker-hosted webhook).
- **Lock-in:** Low vendor-cost lock-in; the Workers runtime is somewhat proprietary but the code is small/portable.
- Sources: [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Cloudflare Access = Zero Trust](https://www.cloudflare.com/sase/products/access/).

**Stripe (constant across all bundles):** 2.9% + 30¢ per card charge; Stripe Billing adds 0.7% of billing volume for subscription management (dunning, retries, metering). No monthly floor. Integration difficulty is roughly equal everywhere — it's a webhook into whatever function runtime you already have. Source: [Stripe fees 2026](https://checkoutpage.com/blog/stripe-processing-fees), [Stripe Billing 0.7%](https://flexprice.io/blog/stripe-pricing-breakdown-2026).

---

## Scored comparison (simplicity-vs-cost axis)

Each dimension scored **1–5 (5 = best)**. "Pieces" = fewer/tighter is higher. "Lock-in" = *lower* lock-in is higher. **Simplicity sub-score** = mean(Pieces, SPA+compute fit, Auth ergonomics, Stripe ease). **Cost sub-score** = Cost-to-first-customers. Composite weights the founder's two named axes evenly (Simplicity 50% / Cost 50%), with Lock-in as a lighter tiebreaker (shown separately).

| Bundle | Pieces | Cost→1st cust. | SPA+compute fit | Auth ergonomics | Stripe ease | (Lock-in↓) | **Simplicity** | **Cost** | **Composite** |
|---|---|---|---|---|---|---|---|---|---|
| **Vercel + Clerk + Stripe** | 5 | 3 (~$20/mo) | 5 | 5 | 5 | 3 | **5.0** | **3.0** | **4.0** |
| **Cloudflare Pages+Workers + Clerk + Stripe** | 4 | 5 (~$5/mo) | 4 (Node-compat risk) | 4 (bolt-on) | 4 | 4 | **4.0** | **5.0** | **4.5** |
| **Netlify + Auth0/Supabase Auth + Stripe** | 4 | 4 (~$0–9/mo) | 4 | 3 | 4 | 3 | **3.75** | **4.0** | **3.9** |
| **Supabase + static host + Stripe** | 3 | 2 (~$25/mo, pays for unused DB) | 3 (Deno, no SPA host) | 4 | 4 | 3 | **3.5** | **2.0** | **2.75** |
| **AWS Amplify/Lambda + Cognito + Stripe** | 2 | 4 (~$0) | 3 | 2 | 4 | 2 | **2.75** | **4.0** | **3.4** |
| **Azure SWA+Functions + Entra External ID + Stripe** | 2 | 5 (~$0) | 4 | 2 | 3 | 2 | **2.75** | **5.0** | **3.9** |

*(Azure and AWS both score high on raw cost but low on simplicity — that low simplicity score, driven by the 4–5 pieces + monitoring assembly + heavy auth, is precisely the "Azure trap" the founder called out. Cheap meter, expensive operator time.)*

---

## Recommendation (informational, not the decision)

**Top: Vercel + Clerk + Stripe.** It maximizes the *simplicity* half of the founder's criterion with the fewest sharp edges: hosting + CDN + **real-Node** compute in one deploy (honoring "reuse `core/` verbatim, no port"), the best-in-class self-serve signup via Clerk, and trivial Stripe integration. The trade is the *cost* half — Vercel's non-commercial Hobby tier forces a **~$20/mo Pro floor** from day one. For a compute-only SaaS chasing its first paying customers, $20/mo is negligible against the operational time saved, which is exactly the balance the founder asked to strike.

**Runner-up (cost-optimized): Cloudflare Pages + Workers + Clerk + Stripe.** Nearly as simple (Pages+Workers is the tightest single-pane hosting+compute of the six) at roughly **4× cheaper** (~$5/mo floor). It scores highest on the blended composite. Two caveats keep it as runner-up rather than top: (1) Workers run on `workerd`/Node-compat, not full Node — a small but real "no-port" fidelity risk to validate with the actual `core/`; and (2) auth is a bolt-on (same Clerk dependency, one more thing to wire than Vercel's smoother path). If a quick spike confirms `core/` runs unmodified on Workers, this becomes the stronger pick on the founder's own balance.

### Things the later decision ticket should weigh
- **Vercel Hobby is non-commercial** → the real Vercel floor is $20/mo, not $0. Don't let a "free tier" headline mislead the cost model.
- **Supabase's free-project 7-day pause** makes it a $25/mo-from-day-one option, and here we'd be paying for a Postgres the compute-only workload never uses — its usual DB advantage is neutralized.
- **Netlify Identity is deprecated**; Netlify's auth story is now the same "bolt-on a third party" as everyone else — no integration edge.
- **Cloudflare Access ≠ consumer signup.** The ticket's "Cloudflare Access" phrasing is a trap: Access is Zero-Trust enterprise gating. A Cloudflare bundle needs a real consumer-auth vendor bolted on.
- **Cognito has the roughest auth DX**, and **Entra External ID the heaviest setup** — both drag the AWS/Azure bundles down on the simplicity axis despite the cheapest meters.
- **Runtime fidelity vs. "no port":** Vercel / Netlify / Azure Functions / AWS Lambda = real Node (safe). Cloudflare Workers = Node-compat (validate). Supabase Edge = Deno (validate). This constraint should be a gate in the decision.
- **Auth is the stickiest lock-in** in every bundle. If future portability matters, prefer a standards-based auth vendor over a deeply proprietary one.

---

## Sources
- Vercel pricing: https://comparedge.com/tools/vercel/pricing · https://blog.vibecoder.me/vercel-pricing-explained-when-free-isnt-enough
- Clerk pricing (50k free, Feb 2026): https://saasprices.net/blog/clerk-free-plan-changes · https://clerk.com/pricing
- Auth0 free tier (25k MAU): https://auth0pricing.com/
- Netlify pricing + Identity deprecation / Auth0 extension: https://costbench.com/software/cloud-infrastructure/netlify/ · https://www.netlify.com/blog/auth0-extension-identity-changes/
- Azure Static Web Apps pricing: https://azure.microsoft.com/en-us/pricing/details/app-service/static/
- Azure Functions Consumption pricing: https://azure.microsoft.com/en-us/pricing/details/functions/
- Microsoft Entra External ID pricing (50k MAU free): https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing
- Amazon Cognito pricing (Essentials 10k MAU free): https://aws.amazon.com/cognito/pricing/ · https://www.thestack.technology/awss-new-cognito-pricing-complicated-potentially-costly/
- Supabase pricing (free-tier pause, $25 Pro): https://uibakery.io/blog/supabase-pricing · https://makerkit.dev/blog/saas/supabase-pricing
- Cloudflare Workers/Pages pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Access (Zero Trust, not consumer auth): https://www.cloudflare.com/sase/products/access/
- Stripe fees & Billing: https://checkoutpage.com/blog/stripe-processing-fees · https://flexprice.io/blog/stripe-pricing-breakdown-2026
