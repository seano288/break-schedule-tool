# Decide the billing configuration

Type: grilling
Status: open

> **Graduated from the Billing-config fog patch. Unblocked and takeable now.** Every upstream blocker is cleared: pricing *shape* by [#04](04-decide-pricing-shape.md), provider by [#07](07-decide-infrastructure-stack.md) (**Stripe**, merchant-of-record consequences knowingly accepted), infrastructure by #07 (**Cloudflare Workers + Clerk**), and [#14](14-research-clerk-billing-per-location.md) has now settled the shape of the work: **this is a direct Stripe integration, not a Clerk Billing configuration.**

## Question

What is the exact billing configuration — the price objects, the trial and conversion path, the quantity control, and the webhook→entitlement path that [#09](09-define-compute-api-surface.md)'s `requireEntitlement()` reads?

## Fixed by upstream — not to be relitigated

- **Value metric: per-location.** One `per_unit` price × N locations. Not per-seat, not per-run. ([#04](04-decide-pricing-shape.md))
- **N is self-declared** — an account attribute, never inferred from upload content. This is a **B1 requirement**, not a convenience: inferring location count from uploads would make billing a consumer of employee data.
- **Runs and uploads are unlimited and uncharged.** Billing is decoupled from the parser and from compute. ([#04](04-decide-pricing-shape.md))
- **Entry is a 14-day trial with no card up front**, card at conversion. ([#04](04-decide-pricing-shape.md))
- **Monthly + discounted annual.** ([#04](04-decide-pricing-shape.md))
- **Provider is Stripe.** ([#07](07-decide-infrastructure-stack.md))
- **Direct Stripe, not Clerk Billing** — and **do not enable Clerk Billing at all**, not even a free Plan "for the components." ([#14](14-research-clerk-billing-per-location.md)) Enabling it welds a **membership cap** onto every Organization (purchased seats *are* the login limit, and it cannot be set manually) and creates Subscription objects Clerk **does not sync to Stripe**, so it is not a wrapper that could be peeled off later. Clerk keeps **auth and Organizations**; `org_id` is the billing key, one `org_id` ↔ one `stripe_customer_id`. Do not re-litigate this — Clerk has no per-unit quantity that is not `seats`, seats mean members, the member count overwrites the checkout quantity at every renewal, and there is no quantity setter anywhere in the Backend API.

## To decide

1. **The price objects themselves** — product/price structure for monthly and annual, the annual discount, and currency. Concrete enough to create.
2. **The entitlement path — [#14](14-research-clerk-billing-per-location.md) made this the most consequential item on the ticket.** #09 specified a single `requireEntitlement()` helper gating both endpoints, "validated and tested, permissive by config during the beta." This ticket owes its *data*: what the Worker reads to decide entitled-or-not, where `org_id → { plan, locationCount, status, periodEnd }` lives, and how it is refreshed on subscription change. Clerk Billing would have carried this **in the session token for free** via `has({ plan })`; direct Stripe does not, and [#03](03-research-managed-platform-landscape.md) recorded that this app has **no database** — a real simplicity win, and this is the first thing to threaten it. #14 flagged **Clerk Organization `privateMetadata`, written by the Stripe webhook via `@clerk/backend` and read back through session claims**, as the option that preserves the no-database property and keeps `requireEntitlement()` a claims read with no network hop — **as the design question, explicitly not as a verified recommendation** (staleness, write contention, metadata-as-database are all real). Weigh it against #07's KV and the infra principle. **One fact to establish either way, carried over unconfirmed from #14:** how stale a claims-based check can be — the propagation delay between a subscription change and the session token reflecting it. If entitlement gates on a claim, that window is the exposure; if it gates on our own store, the webhook lag is.
3. **Trial → conversion mechanics.** What happens at day 14 with no card: hard stop, grace period, or read-only. Interacts with the invite-only beta, where billing ships **dormant** ([#07](07-decide-infrastructure-stack.md)) — so the trial clock may not even run during the beta, and that should be explicit rather than incidental.
4. **Self-serve quantity control.** How a customer changes their location count, and the proration behaviour. Under direct Stripe the fork is **hosted Customer Portal with quantity updates enabled** vs. **our own "how many locations?" control** writing through to the subscription item; proration is `proration_behavior` and — unlike Clerk, where *"purchased seats cannot be reduced mid-period"* — works **in both directions**, so a chain closing a store gets credited. ([#14](14-research-clerk-billing-per-location.md))
5. **What happens when the declared count is wrong** — under-declaring is the obvious abuse, and [#04](04-decide-pricing-shape.md) deliberately deferred content-based enforcement. Confirm that deferral still holds under the invite-only beta and record what would reopen it. Note [#09](09-define-compute-api-surface.md)/[#10](10-set-per-request-size-ceiling.md) give us `location` counts per request as **observability**, not enforcement — and [#12](12-define-observability-without-pii.md)'s standing rule is that a file-derived field ships only with a named consumer, so wiring that to billing is a decision with a privacy face, not a free win.
6. **Failed-payment and cancellation behaviour** — dunning, and what an unentitled-but-existing account can still do.

## Deliberately out of this ticket

- **Tier banding and freemium** — deferred by [#04](04-decide-pricing-shape.md); nothing since has reopened them.
- **US multi-state sales-tax registration and remittance** — still a live obligation created by choosing Stripe over a merchant-of-record, but it is a separate workstream that stays fogged until the beta cohort and first customer states are known. Stripe Tax calculates; it does not register or file. **Must be discharged before the first real charge**, which the dormant-billing beta postpones but does not remove.
- **The billing UI surface.** Belongs to the frontend, and v1 ships billing dormant ([#07](07-decide-infrastructure-stack.md)) — so [#16](16-decide-frontend-architecture.md) does not wait on this ticket.

## Notes for whoever runs this

[#14](14-research-clerk-billing-per-location.md) left three build-level pointers. They are starting points to verify against **Stripe's** docs in this ticket, not facts already established:

- **Stripe primitives map cleanly onto #04's entry path** — one product, one `per_unit` recurring price, two intervals; `quantity: N` on the subscription item is exactly the primitive Clerk lacks; `trial_period_days: 14` with `payment_method_collection: 'if_required'` (or the equivalent trial setting) for the no-card trial.
- **Two V8-isolate requirements** for the webhook route on Workers: signature verification must use the **async/WebCrypto** constructor (`constructEventAsync`), not the synchronous Node one, and the Stripe SDK's **Fetch HTTP client** must be selected. Both are known isolate constraints; confirm them rather than assume them.
- **Stripe's event analogues** of the entitlement path: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`.

## Done when

The price objects are specified precisely enough to create, the entitlement path is specified precisely enough for `requireEntitlement()` to be written against, and the trial/quantity/failure behaviours are settled.
