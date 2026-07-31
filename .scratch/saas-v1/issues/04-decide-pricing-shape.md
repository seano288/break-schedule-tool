# Decide pricing shape

Type: grilling
Status: resolved

## Question

What is the *shape* of v1 pricing — per-location, per-employee/seat, flat monthly, usage-metered (per schedule run), or tiered — not the dollar amount, but the billing model the signup flow and billing config must implement?

This gates the billing provider/config work: metered vs. seat-based vs. flat drives very different Stripe setups and very different signup UX. It also interacts with the buyer (a single-store manager vs. a multi-location ops director) and with value metric (is value proportional to locations, headcount, or runs?).

Resolve via `/grilling` + `/domain-modeling`: who the buyer is, what the value scales with, what's easy to meter given B1 (transient, per-run compute is naturally observable), and what competitors/adjacent tools charge on.

Deliverable: the chosen pricing shape + value metric, with rationale, recorded as the constraint the billing ticket builds to.

## Answer

**Shape: linear per-location subscription.** Bill = price × N locations, billed monthly or annually (annual discounted).

Resolved via `/grilling`. Decisions, in dependency order:

- **Buyer = multi-location retail chain** (ops/compliance owner), not the single-store manager. Validated by fact: an existing user is a multi-location chain. This overrode the charting-time lean toward buyer A.
- **Value metric = per-location** (number of stores under management). Chosen over per-seat and per-run because it's how the buyer already conceptualizes their fleet, it's stable/predictable (ops directors dislike variable bills), and it sidesteps B1's constraints — headcount is unstored and per-run compute is something you *don't* want to charge for (a compliance tool must never disincentivize re-running).
- **Billing shape = pure linear per-location.** One `per_unit` price, quantity = locations. Chosen over tiered/banded and base+overage to minimize config and maximize signup transparency ("$X per store, change your count anytime"). Volume banding is a revenue optimization deferred until price-elasticity is known.
- **Metering = self-declared subscription quantity.** Location count is an *account/subscription* attribute (storing it does not violate B1, which governs *employee* data only), never inferred from upload content. This keeps billing entirely inside the Stripe/account layer and never couples it to the parser. Content-based enforcement is deferred.
- **Runs/uploads = unlimited and uncharged.** Billing is deliberately decoupled from compute and from how a chain uploads (one combined file vs. one-per-store is irrelevant to price). You pay for fleet size, not compute frequency.
- **Entry = 14-day free trial, no card up front**, auto-converts to paid at trial end (card collected at conversion). Chosen over freemium (which fights the buyer-B choice and invites a chain to split into N free accounts) and paid-only (which throws away the "try it on your real schedules" moment that sells a compliance tool).
- **Interval = monthly and annual**, annual discounted, chosen at checkout.

**Deferred, low-regret later adds** (none require re-architecting): volume/tier banding, content-based location enforcement, freemium tier.

### Constraint handed to the billing ticket

Stripe configuration for v1:
- One `per_unit` recurring price, quantity = locations, in **two intervals** (monthly + discounted annual).
- Subscription **trial ~14 days with no payment method required at signup**; collect card at conversion.
- Self-serve **quantity control** — customer sets/adjusts location count in a billing portal.
- **No** metered usage, **no** per-run billing events, **no** location enforcement in v1.
