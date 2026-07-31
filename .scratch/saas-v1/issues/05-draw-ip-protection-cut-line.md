# Draw the IP-protection cut-line

Type: grilling
Status: resolved

## Question

Exactly where does the client/server boundary fall so the algorithm IP is protected — what runs server-side, what stays in the client, and does any part of the algorithm leak through the API's inputs/outputs?

IP protection is *the* reason for the server-side (B1) architecture, so the cut-line must be deliberate, not incidental. Resolve:

- Which `src/core/` modules move server-side (the scheduling math) vs. which client-side concerns remain (parsing/column-mapping UI, rendering the result, xlsx read/write).
- Does parsing happen client-side (only the normalized canonical model is POSTed — keeps raw file off the server, supports the transient-data story) or server-side? Trade-off: client-side parsing leaks the *canonical model shape* but not the algorithm; it also strengthens "we barely touch your data."
- Residual leakage: can the algorithm be reverse-engineered from enough input→output pairs? Is any rate-limiting / abuse consideration needed to protect against bulk extraction?
- What exactly gets deleted from the client bundle that ships today.

Deliverable: a precise boundary spec (client responsibilities | API contract | server responsibilities) that the canonical-model and infrastructure tickets build against.

## Answer

Resolved via `/grilling`. The IP is the **staggering optimizer** (`optimizer.js` + `coverage.js`); the CA compliance rules are public law. The cut-line is drawn to keep the client lean and put the entire processing pipeline server-side.

**Five decisions (in dependency order):**

1. **Parse boundary = server-side (Option B).** Client uploads the *raw file*; the server parses it. Chosen for a lean/fast client over Option A (client parses, POSTs canonical model). Consistent with B1 — the raw file is processed **in memory and never stored**. Side benefit: the canonical-model *shape* never crosses the wire (the wire input is the raw file), so the one leak Option A carried doesn't exist here.
2. **Column-mapping = B-preset for v1.** Client picks a named preset (e.g. "UKG Retail Schedule Planner") + upload; server applies that preset's column map with auto-detect as default. Files matching no preset are **rejected loudly**, never silently mis-parsed (a mis-read shift = manufactured compliance liability). Interactive per-file mapping (**B-map**) is the **v2** fallback if presets prove too brittle.
3. **Output boundary = server renders (R-server).** Server runs `ExcelFacade.writeBreaks`, returns the finished styled `.xlsx` + a JSON preview payload. Client is a thin shell (show preview, offer download). No IP-leakage dimension — the output *is* the product regardless of format; under B the xlsx toolchain is already server-side, so write is marginal.
4. **Core granularity = whole-core-opaque.** All of `src/core/` moves server-side as **one unit**; the client duplicates **zero** scheduling or rule logic. Rejected a rules/optimizer split: the two are entangled in today's code (the #01 bugs span `EmployeeSchedule` + `BreakScheduler` + `optimizer`), and client-side rule duplication risks **drift** → the exact "compliance veneer over a subtle error" failure #01 warns against. Client-side pre-validation deferred to post-v1.
5. **Bulk-extraction = accept.** The API is a black-box oracle; an authenticated user can harvest input→output pairs. Protection = **auth-gate the compute endpoint + tiered per-account abuse rate-limit (trials tighter than paid) + anomaly logging + accept residual.** Output-perturbation defenses are ruled out by the product's nature (can't fuzz a compliance output). The abuse ceiling is a burst/anomaly guard, **not** a usage quota — reconciles with the pricing ticket's "runs unlimited & uncharged." No-card trial (from pricing) is the widest exposure, mitigated by the tighter trial rate-limit rather than by killing the trial. Residual cloning risk accepted: huge user-defined input space (coverage groups + settings), public-law rules, thin competitor motive in a niche CA-retail market.

### Boundary spec

**Client responsibilities** — file picker; preset selection; hold + send settings (coverage groups, operating hours, advanced settings) *per request* (no v1 server persistence); POST raw file + preset id + settings; render on-screen preview from returned JSON; offer returned xlsx for download; auth/billing UI. **Ships none of `src/core/`.**

**API contract** — authenticated `POST` (multipart): `{ rawFile, presetId, settings:{ operatingHours, groups, advancedSettings } }` → response `{ xlsx (styled, for download), previewJson (breaks + segments per employee), complianceFlags (per-employee "cannot be made compliant", from #01) }`. Auth-gated; tiered abuse rate-limit; anomaly logging; no output perturbation.

**Server responsibilities** — xlsx read/parse via preset (B-preset); build the canonical model (**server-internal** seam, per #06); run `scheduleBreaks` + `optimizer` + `coverage` (the IP); render output xlsx + preview JSON. Employee data in-memory only, never persisted (B1). The whole of `src/core/` **plus** parse + render live here.

### Constraints handed downstream

- **To #06 (canonical model + parser interface):** the parser runs **server-side**, and the canonical model is a **server-internal seam — NOT the API/wire contract** (the wire input is the raw file). The pluggable-parser goal still holds, server-side: the v1 variant is the UKG preset; the interface must leave room for B-map interactive mapping (v2) and future API parsers.
- **To the (now graduated) Infrastructure-stack ticket:** must auth-gate the compute endpoint, support **tiered abuse rate-limiting + anomaly logging**, and host real-Node serverless compute that runs `src/core/` **verbatim** (no port) alongside the xlsx read/write toolchain, fronted by a thin static client.
- **To Frontend architecture (fog):** the client is a thin shell — upload + preset dropdown + preview/download + auth/billing — and holds settings client-side (no v1 persistence), sending them per request.
