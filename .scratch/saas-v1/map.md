# Break-Scheduling SaaS v1
<!-- wayfinder:map -->

## Destination

A **buildable v1 spec** for a **CA-first, server-side-compute break-scheduling SaaS** — a document a builder (human or agent) can start from, with the strategic and architectural forks already resolved.

## Notes

**Domain:** Takes an hourly-worker shift schedule, computes CA-compliant meal periods and rest breaks (split-shift aware), and staggers breaks so coworkers in a department aren't out at once. The valuable IP is the `core/` algorithm.

**Skills to consult each session:** `/grilling` + `/domain-modeling` for decision tickets; `/research` (subagent) for research tickets; `/prototype` where "how should it behave/look" is the question.

**Constraints & governing principles (settled during charting):**
- **Only preserved asset:** the `src/core/` algorithm — moves server-side, reused verbatim. Everything else (current UI, Vite SPA, GitHub Pages deploy) is greenfield/disposable.
- **B1 compute-only:** the algorithm runs server-side (IP protection); employee data is transient — processed in memory, never stored.
- **Retail-only** for v1.
- **Seam principle:** a canonical schedule model + pluggable adapters at every edge — ingestion parsers, vertical rules, state rules. The core stays pure; all variation lives in adapters.
- **Infra principle:** prefer managed / off-the-shelf services over self-operated infrastructure, on every infra decision. Criterion: balance deployment/operational simplicity against cost.
- **Backend:** Node/TS serverless (reuses `core/` unmodified — no port).
- **Frontend:** greenfield, open decision.
- **Self-serve** SaaS, built on managed auth + billing services.
- **Multi-state:** an architectural constraint (state rules = a pluggable adapter), CA-only implemented in v1.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Research the scheduling-integrations landscape](issues/02-research-integrations-landscape.md) — **validates the upload-only bet.** Every major WFM/scheduling product (UKG, Workday, Deputy, When I Work, Homebase, etc.) offers a file export; **none has a self-serve API** (all need tenant + approval). So tabular-upload + UKG preset is sufficient v1 coverage. **Real risk = column-variance** (UKG columns are admin-configurable) → invest in robust column-mapping, not more formats. First post-v1 API parser: UKG Pro WFM, then Deputy. Never build to Kronos WFC (EOL).
- [Audit CA compliance completeness](issues/01-audit-ca-compliance-completeness.md) — **close but not correct.** Rest-break count + first-meal deadline verified right. **3 bugs, all on long/split shifts:** (B1 HIGH) shifts >10h silently drop the 2nd meal + 3rd rest (no `rest3`/`REST3` slot+column); (B2 MED-HIGH) split-shift gap accepted as meal with no timing check; (B3 MED) no impossibility detection. **v1 must-handle:** 5-break model + output cols, split-gap timing check, per-employee "can't comply" flag. **Defer:** meal waivers, §226.7 premium-pay math, split-shift premium. → unblocks the canonical-model ticket.
- [Research the managed-platform landscape](issues/03-research-managed-platform-landscape.md) — *informational, not a decision.* Recommends **Vercel + Clerk + Stripe** for simplicity (~$20/mo floor); runner-up **Cloudflare Pages + Workers + Clerk + Stripe** (~$5/mo, but Node-compat + bolt-on auth caveats). Feeds the fogged Infrastructure-stack decision. Traps flagged: Vercel free tier bans commercial use, Supabase forces ~$25/mo, Netlify Identity deprecated, Cloudflare Access ≠ consumer signup, Azure/AWS cheap-but-complex.

## Not yet specified

- **Infrastructure-stack decision** — pick the concrete hosting + auth + billing bundle. Blocked by the platform-landscape research and the IP-cut-line decision.
- **Billing provider & config** — depends on the pricing shape and the chosen infra stack.
- **Frontend architecture** — framework/shape of the greenfield client. Depends on the infra stack.
- **v1 feature-scope lock + spec assembly** — the final synthesis that produces the destination artifact; blocked by ~all upstream decisions.

## Out of scope

- Food-service (and any non-retail) vertical — seam designed for it, not built.
- Multi-state rules beyond CA — architecture allows it; not implemented in v1.
- Server-side persistence / schedule history / audit records (the B2 model).
- Direct API integrations — v1 is upload-only.
- JSON / non-tabular ingestion parsers.
- The existing free `kadencampb.github.io` tool — a disposable college assignment; no migration, no carryover.
