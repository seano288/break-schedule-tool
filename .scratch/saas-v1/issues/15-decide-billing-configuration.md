# Decide the billing configuration

Type: grilling
Status: open
Blocked by: 14

> **Graduated from the Billing-config fog patch.** Every upstream blocker is cleared: pricing *shape* by [#04](04-decide-pricing-shape.md), provider by [#07](07-decide-infrastructure-stack.md) (**Stripe**, merchant-of-record consequences knowingly accepted), infrastructure by #07 (**Cloudflare Workers + Clerk**). What remains is the concrete configuration. Blocked by [#14](14-research-clerk-billing-per-location.md), which determines whether this ticket is configuring Clerk Billing or specifying a direct Stripe integration.

## Question

What is the exact billing configuration — the price objects, the trial and conversion path, the quantity control, and the webhook→entitlement path that [#09](09-define-compute-api-surface.md)'s `requireEntitlement()` reads?

## Fixed by upstream — not to be relitigated

- **Value metric: per-location.** One `per_unit` price × N locations. Not per-seat, not per-run. ([#04](04-decide-pricing-shape.md))
- **N is self-declared** — an account attribute, never inferred from upload content. This is a **B1 requirement**, not a convenience: inferring location count from uploads would make billing a consumer of employee data.
- **Runs and uploads are unlimited and uncharged.** Billing is decoupled from the parser and from compute. ([#04](04-decide-pricing-shape.md))
- **Entry is a 14-day trial with no card up front**, card at conversion. ([#04](04-decide-pricing-shape.md))
- **Monthly + discounted annual.** ([#04](04-decide-pricing-shape.md))
- **Provider is Stripe.** ([#07](07-decide-infrastructure-stack.md))

## To decide

1. **The price objects themselves** — product/price structure for monthly and annual, the annual discount, and currency. Concrete enough to create.
2. **The entitlement path.** #09 specified a single `requireEntitlement()` helper gating both endpoints, "validated and tested, permissive by config during the beta." This ticket owes its *data*: what the Worker reads to decide entitled-or-not, where that state lives, and how it is refreshed on subscription change. Note the infra principle — prefer managed over self-operated — and #07's KV availability.
3. **Trial → conversion mechanics.** What happens at day 14 with no card: hard stop, grace period, or read-only. Interacts with the invite-only beta, where billing ships **dormant** ([#07](07-decide-infrastructure-stack.md)) — so the trial clock may not even run during the beta, and that should be explicit rather than incidental.
4. **Self-serve quantity control.** How a customer changes their location count, and the proration behaviour. Shape depends on #14's answer.
5. **What happens when the declared count is wrong** — under-declaring is the obvious abuse, and [#04](04-decide-pricing-shape.md) deliberately deferred content-based enforcement. Confirm that deferral still holds under the invite-only beta and record what would reopen it. Note [#09](09-define-compute-api-surface.md)/[#10](10-set-per-request-size-ceiling.md) give us `location` counts per request as **observability**, not enforcement — and [#12](12-define-observability-without-pii.md)'s standing rule is that a file-derived field ships only with a named consumer, so wiring that to billing is a decision with a privacy face, not a free win.
6. **Failed-payment and cancellation behaviour** — dunning, and what an unentitled-but-existing account can still do.

## Deliberately out of this ticket

- **Tier banding and freemium** — deferred by [#04](04-decide-pricing-shape.md); nothing since has reopened them.
- **US multi-state sales-tax registration and remittance** — still a live obligation created by choosing Stripe over a merchant-of-record, but it is a separate workstream that stays fogged until the beta cohort and first customer states are known. Stripe Tax calculates; it does not register or file. **Must be discharged before the first real charge**, which the dormant-billing beta postpones but does not remove.
- **The billing UI surface.** Belongs to the frontend, and v1 ships billing dormant ([#07](07-decide-infrastructure-stack.md)) — so [#16](16-decide-frontend-architecture.md) does not wait on this ticket.

## Done when

The price objects are specified precisely enough to create, the entitlement path is specified precisely enough for `requireEntitlement()` to be written against, and the trial/quantity/failure behaviours are settled.
