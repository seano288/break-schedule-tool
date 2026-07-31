# Research the managed-platform landscape

Type: research
Status: resolved
Context: findings at `.scratch/saas-v1/research/03-managed-platform-landscape.md`

## Question

Across the managed-platform options for a Node/TS serverless SaaS, which bundles of **hosting + auth + billing** best satisfy the governing criterion — minimize deployment/operational complexity while keeping cost low?

Context: backend is Node/TS serverless, compute-only (stateless request/response, nothing persisted). Self-serve signup required. Frontend is greenfield. The user explicitly named the Azure trap: cheap compute but you assemble static hosting + tables + functions + auth + monitoring as separate pieces.

Evaluate the realistic bundles, e.g.: Vercel (+ Clerk/Auth0 + Stripe), Netlify (+ auth + Stripe), Azure Static Web Apps + Functions (+ Entra/B2C + Stripe), AWS Amplify/Lambda (+ Cognito + Stripe), Supabase (auth + edge functions + db) + Stripe, Cloudflare (Pages + Workers + Access) + Stripe.

For each, capture: how many separate pieces the operator must wire and monitor, the cost curve from zero to first paying customers, how naturally it hosts a greenfield SPA + serverless compute endpoint, auth ergonomics for self-serve signup, Stripe integration ease, and lock-in.

Deliverable: a scored comparison on the simplicity-vs-cost axis with a top recommendation and runner-up, feeding the later Infrastructure-stack decision. Note: this informs but does not decide — the decision is a separate (fogged) ticket.

## Answer

Full findings: [`research/03-managed-platform-landscape.md`](../research/03-managed-platform-landscape.md).

**Top recommendation: Vercel + Clerk + Stripe** — wins the simplicity axis outright (real-Node compute + SPA + CDN in one deploy, honoring "reuse `core/` verbatim, no port"; best-in-class self-serve signup via Clerk; trivial Stripe). Cost floor ~$20/mo (Vercel Hobby bans commercial use).

**Runner-up: Cloudflare Pages + Workers + Clerk + Stripe** — ~$5/mo floor, nearly as simple; caveats to validate = Workers run Node-compat (not full Node) and auth is a bolt-on.

**Traps flagged for the Infrastructure-stack decision ticket:** Vercel's free tier isn't free for a real SaaS; Supabase forces ~$25/mo from day one for a Postgres this compute-only workload never uses; Netlify Identity is deprecated (auth now a bolt-on); "Cloudflare Access" is Zero-Trust enterprise gating, not consumer signup; Azure/AWS are cheapest at the meter but lowest on simplicity (the named "Azure trap").

This **informs but does not decide** — the choice is the fogged Infrastructure-stack ticket.
