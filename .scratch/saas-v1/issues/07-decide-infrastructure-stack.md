# Decide the infrastructure stack

Type: grilling
Status: open

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
