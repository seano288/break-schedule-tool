# Decide the frontend architecture

Type: grilling
Status: open

> **Graduated from the Frontend-architecture fog patch.** Both original blockers are cleared — hosting and auth by [#07](07-decide-infrastructure-stack.md) (**Cloudflare Pages + Clerk** drop-in components), and the contract it is written against by [#09](09-define-compute-api-surface.md). **Unblocked and takeable now.** The billing surface is explicitly *not* in scope (see below), so this does not wait on [#15](15-decide-billing-configuration.md).

## Question

What is the framework and shape of the greenfield client?

## The starting position

**The existing UI is disposable** — a college-assignment SPA. The current wizard's step order is **not** a constraint on the new design, and none of `src/core/` ships to the browser ([#05](05-draw-ip-protection-cut-line.md): whole-core-opaque, client duplicates zero rule logic).

Shape, as far as the map already fixes it: a **thin shell** over **upload → `/inspect` → configure → `/schedule` × N**, holding settings client-side with no v1 persistence.

## Obligations already handed to this ticket

These are decided upstream and are **not** open for relitigation here — they are the requirements the architecture must satisfy. Six, from three tickets:

From [#09](09-define-compute-api-surface.md):

1. **The department inventory arrives from `/inspect`**, so the coverage-group UI is **gated on a successful upload** — the client cannot express `settings.groups` before a parse, which is why the single-POST design of #05 was unsendable by a first-time user.
2. **Bounded-concurrency fan-out (~4)** over locations to `/schedule`.
3. **Independent per-location row states** — `pending → done → download`, `failed → reason → retry`.
4. **A loud, persistent partial-failure summary** ("8 of 10 locations scheduled…"). #09 named this the accepted cost of first-class partial success, making it a **UI obligation, not a nicety**.

From [#10](10-set-per-request-size-ceiling.md):

5. Display each location's **`employeeCount` prominently** and its server-computed **`sizeWarning`** flag (advisory only — the client may fan out anyway). Rationale: a manager who knows their store has 60 people recognises "1 location — 612 employees" instantly, which is how the tier-3 merged-location case gets caught by a human. Also render #10's **too-large-to-schedule** failure copy — whose remediation hint comes **from the parser preset**, not from the client.

From [#06](06-design-canonical-model-and-parser-interface.md) / [#11](11-decide-missing-employee-id-fallback.md):

6. Render **document-level notices** alongside per-employee-day exceptions — the tier-3 location assumption, and #11's `identityKind`/`identityLabel` degraded-mode notice. **#11's is not advisory-only**: a name-keyed run *refuses whole employee-days*, so the count of `IDENTITY_AMBIGUOUS` days needs the same prominence as the partial-failure summary.

## To decide

1. **Framework and build** — what the shell is written in, on Cloudflare Pages, integrating Clerk's drop-in components.
2. **The step model.** The old wizard's order is not binding, and #09's contract reshapes it: upload now precedes configuration because departments come from the parse. Whether the result is still a wizard at all is open.
3. **Where settings live.** No v1 persistence is the current position — worth testing, since a manager re-uploading weekly re-enters coverage groups every time. Note **re-upload per location** was accepted for v1 in #09 with a written ~20-location trigger for revisiting the KV handle.
4. **How the fan-out and its per-location states are modelled**, given obligations 2–4 are simultaneous and partial failure is first-class rather than exceptional.
5. **Notice and exception presentation** — one surface or two, given #06's channel is per-employee-day and the document-level channel (obligation 6) has two confirmed consumers. **[#11](11-decide-missing-employee-id-fallback.md) decided the degraded-mode banner is rendered into the xlsx itself**, because a UI-only warning dies at download; this ticket decides the *screen* half, not that.
6. **The download surface** — #09 returns xlsx plus `previewJson` per location; what the user sees before downloading, and whether preview is worth its complexity.

## Deliberately out of scope

- **The billing/account surface** — pricing page, quantity control, upgrade prompts. Follows [#15](15-decide-billing-configuration.md), and v1 ships billing **dormant** under the invite-only beta ([#07](07-decide-infrastructure-stack.md)), so it is not needed at launch. This is why this ticket is unblocked.
- **Interactive per-file column mapping (B-map)** — v2, and per [#06](06-design-canonical-model-and-parser-interface.md) it arrives as a new *parser*, not a UI feature.
- **The onboarding / export-tutorial rewrite** — still fogged, and waiting on [#13](13-get-anchor-tenant-report-facts.md). This ticket covers the app; the tutorial is a separate surface.

## Done when

The framework is chosen, the step model and settings lifetime are settled, and the fan-out/notice/failure surfaces are specified against all six obligations above.
