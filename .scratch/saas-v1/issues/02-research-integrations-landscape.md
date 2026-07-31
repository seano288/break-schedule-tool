# Research the scheduling-integrations landscape

Type: research
Status: resolved
Context: findings at `.scratch/saas-v1/research/02-integrations-landscape.md`

## Question

What workforce-scheduling products are common among California hourly employers, and which expose a schedule *export* (file or API) we could ingest — now or post-v1?

Integrations are out of scope for the v1 build (upload-only), but this research (a) confirms the tabular-upload bet covers the real market and (b) tells the canonical-model/parser design whether to anticipate an API parser.

For each major product, capture: typical customer segment (enterprise vs SMB, retail vs food service), whether it offers a schedule export/report as a file (xlsx/CSV) and in what shape, whether it has a public/partner API that exposes schedules, and the access tier/cost/approval required for that API.

Products to investigate (not exhaustive): UKG (Pro, Dimensions, Ready, and the Retail Schedule Planner we already ingest), Workday, Deputy, When I Work, Homebase, Quinyx, Legion, 7shifts (food service), HotSchedules, Kronos legacy.

Deliverable: a comparison table + a short read on whether "generic tabular upload with a UKG preset" is sufficient v1 coverage, and which 1–2 integrations would be the highest-value first API parser post-v1.

## Answer

Full findings (cited to vendor developer/help docs): [`research/02-integrations-landscape.md`](../research/02-integrations-landscape.md).

**Validates the v1 bet.** Market splits into enterprise WFM (UKG Pro WFM/Dimensions, UKG Pro, UKG Ready, Workday, Quinyx, Legion, legacy Kronos WFC) and SMB/mid-market (Deputy, When I Work, Homebase, 7shifts, HotSchedules). **Every one exposes a manager/admin schedule export as a file** (xlsx/CSV for retail-relevant products); **none offers a self-serve public API** — all require a customer tenant + application/approval/provisioning.

So "generic tabular upload with a UKG preset" is sufficient v1 coverage; an API would add OAuth + partner-approval friction without reducing onboarding friction. **Real v1 risk = column-variance** (UKG's export columns are admin-configurable) → invest in a robust column-mapping layer, not more file formats.

**First post-v1 API parser:** UKG Pro WFM (same vendor as the anchor, lowest new-concept cost), then Deputy (best-documented retail-general shift API). Avoid: Workday/Legion (enterprise-only, heavyweight), 7shifts/HotSchedules (food-service, out of retail scope), Kronos WFC (EOL 2025/2027 — never build to it).
