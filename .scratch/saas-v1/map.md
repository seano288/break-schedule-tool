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
- [Draw the IP-protection cut-line](issues/05-draw-ip-protection-cut-line.md) — **thin client, whole pipeline server-side.** Parse boundary = **server-side (Option B)**: client uploads the *raw file*, server parses (in-memory, never stored — B1-safe); the canonical-model shape never crosses the wire. Mapping = **B-preset** (named presets + auto-detect, loud rejection of unmatched files); interactive **B-map** deferred to **v2**. Output = **R-server** (server renders styled xlsx + preview JSON; client is a thin shell). Granularity = **whole-core-opaque** — all of `src/core/` server-only as one unit, client duplicates zero rule logic (drift = the #01 failure mode). Bulk-extraction = **accept**: auth-gate + tiered abuse rate-limit (trials tighter) + anomaly logging + accept residual; output-perturbation ruled out (compliance tool); abuse ceiling ≠ usage quota (pricing = unlimited runs). → **unblocks the Infrastructure-stack decision** and hands #06 the constraint that the parser is server-side and the canonical model is a *server-internal* seam, not the wire contract.
- [Decide pricing shape](issues/04-decide-pricing-shape.md) — **linear per-location subscription.** Buyer = multi-location retail chain (fact: existing user is a chain), so value metric = **per-location** (not per-seat/per-run). Shape = one `per_unit` price × N locations, **monthly + discounted annual**. Location count is **self-declared** (an account attribute, B1-safe — never inferred from uploads); **runs/uploads unlimited & uncharged** (billing decoupled from parser and compute). Entry = **14-day trial, no card up front**, card at conversion. Deferred: tier banding, content-based enforcement, freemium. → hands the billing ticket its exact Stripe constraint.

- [Design canonical schedule model + parser interface](issues/06-design-canonical-model-and-parser-interface.md) — **the seam is a flat `Segment[]`; all domain reasoning sits behind it in `core/`.** Reframing: `core/` was *never* decoupled — `scheduleBreaks` took the raw sheet grid and parsed it internally, so this cut the parser **out** of `core/` and moved day-splitting **in**. Model = `{employeeId, employeeName, workdayDate, dept, job, start, end}`, one record per source row. Decisions: (1) parser flattens layout state, **core** owns identity/grouping/workday-partitioning/split-shift detection — mis-grouping is compliance-relevant, so it gets one audited home; (2) **`employeeId` required, file rejected without it** — today's name-keyed identity merges two same-named employees into a fabricated split shift that *cancels a required meal*; (3) **day-anchored minutes, `end` may exceed 1440** — fixes a live bug where a 10PM–6AM shift yields `totalWorkMinutes = −960` and therefore **zero breaks**; keeps `core/`'s minute thresholds "verbatim"; v1 *flags* cross-midnight rather than applying §500; (4) **no provenance — output rendered fresh** from canonical + results, reusing the existing stylers (they take `(sheet, rows)`); removes `rowIndex` from `core/`, lets the upload be discarded (B1), kills `deleteColumnD`; (5) **one code module per format** (`detect`/`parse` + rejecting registry), no shared column-map DSL from n=1 — so **B-map v2 is a new parser**; (6) **tiered errors** — fatal → reject upload; an unparseable employee row **poisons that employee-day** (reported, not silently short-houred); by-rule skips silent. Fell out: **one exception channel** for `CANNOT_COMPLY` + `OVERNIGHT_UNSUPPORTED` + `SOURCE_ROW_UNPARSEABLE`, and **five named break slots** so #01's B1 collision is unrepresentable. → raises **#08**.

## Not yet specified

- **Billing provider & config** — pricing shape now **settled** (linear per-location; see Decisions). Remaining unknown is only the concrete provider/config, still blocked by the infra-stack choice. Graduates to a ticket once the infra stack is picked.
- **Frontend architecture** — framework/shape of the greenfield client. Depends on the infra stack. Shape now **constrained** by the cut-line: a *thin shell* — upload + preset dropdown + preview/download + auth/billing UI, holding settings client-side (no v1 persistence) and POSTing them per request; ships none of `src/core/`.
- **Onboarding / export-tutorial rewrite** — surfaced by the canonical-model decision: since `employeeId` is now **required**, the UKG export walkthrough (`ExportHelpStep.js`, the 500-line `UkgMock.js` click-through) must teach including an identifier column, so a missing id is *prevented* at export time rather than caught at upload. Exact shape waits on [#08](issues/08-confirm-ukg-employee-id-column.md) — whether the column is default-on or admin-configurable changes whether this is a verification step or a hard prerequisite.
- **v1 feature-scope lock + spec assembly** — the final synthesis that produces the destination artifact; blocked by ~all upstream decisions, now including [#08](issues/08-confirm-ukg-employee-id-column.md).

## Out of scope

- Food-service (and any non-retail) vertical — seam designed for it, not built.
- Multi-state rules beyond CA — architecture allows it; not implemented in v1.
- Server-side persistence / schedule history / audit records (the B2 model).
- Direct API integrations — v1 is upload-only.
- JSON / non-tabular ingestion parsers.
- The existing free `kadencampb.github.io` tool — a disposable college assignment; no migration, no carryover.
- Interactive per-file column-mapping UI (**B-map**) — v1 ships preset-based mapping only (B-preset) with loud rejection of unmatched files; interactive mapping is a **v2** fast-follow. See [the IP-cut-line decision](issues/05-draw-ip-protection-cut-line.md). **Amended by [#06](issues/06-design-canonical-model-and-parser-interface.md):** since parsers are per-format code modules with no shared column-map abstraction, B-map arrives as a **new parser**, not as a preset instance reusing the v1 seam.
- Cross-midnight (overnight) shift rules — the canonical model *expresses* them (`end` may exceed 1440) and v1 **flags** them as unsupported per employee, but CA §500 workday-spanning rules are not applied. Deliberately deferred to v2; no model migration needed then. See [#06](issues/06-design-canonical-model-and-parser-interface.md).
- Carrying the customer's own extra columns / formatting through to the output — v1 renders a fresh document from the canonical model instead of annotating the upload. See [#06](issues/06-design-canonical-model-and-parser-interface.md).
