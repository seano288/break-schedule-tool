# Can Clerk Billing serve a per-location value metric?

Type: research
Status: open

> **Graduated from the Billing-config fog patch.** [#04](04-decide-pricing-shape.md) fixed the value metric as **per-location**; [#07](07-decide-infrastructure-stack.md) settled the provider as **Stripe** and the auth layer as **Clerk**. The map has flagged since #07 that Clerk Billing "bills per org *member*, but the value metric is *locations*" and that the mismatch "must be verified rather than assumed." This is that verification — a fact, not a decision, so it is split out ahead of the config ticket it blocks ([#15](15-decide-billing-configuration.md)).

## Question

Can Clerk Billing express a subscription priced as **one `per_unit` price × N self-declared locations**, where N is an account attribute that bears **no relationship to the number of Clerk users or organization members**?

The concrete failure case: a 10-location retail chain with 3 logins must be billed for **10**, not 3. A single-location customer with 8 managers must be billed for **1**, not 8.

## Why it matters

It is a fork, not a detail. Clerk Billing is a wrapper over Stripe:

- **If it can** — the billing surface is largely drop-in alongside the Clerk auth components already chosen in #07, and [#15](15-decide-billing-configuration.md) is mostly configuration.
- **If it cannot** — we integrate **Stripe directly** and own the checkout, customer portal, quantity control and webhook→entitlement path ourselves. #07 already accepted Stripe's merchant-of-record consequences knowingly, so this does not reopen the provider choice; it changes how much we build.

## What to establish

1. **Whether Clerk Billing's quantity is settable independently of seat/member count**, or is derived from organization membership. This is the crux — everything else is secondary.
2. **Whether a self-serve quantity control exists** (customer changes their own location count mid-subscription) and how proration is handled. #04 requires self-serve quantity control.
3. **Whether a 14-day trial with no payment method up front** is supported — #04's entry path, card collected at conversion.
4. **Whether monthly + discounted annual** on the same product is expressible.
5. **What reaches our Workers backend on subscription change** — the webhook or API surface #15 needs for the entitlement path that [#09](09-define-compute-api-surface.md)'s `requireEntitlement()` helper reads.
6. **Pricing/fee overhead** of Clerk Billing on top of Stripe's own fees. #07 chose Stripe partly on a ~$56/yr fee margin; a percentage cut on top is material to that reasoning.

## Notes for whoever runs this

- Answer from **Clerk's own primary documentation**, not blog posts or comparison sites. Where a capability cannot be confirmed from a primary source, mark it **unconfirmed** rather than inferring it — the pattern [#08](08-confirm-ukg-employee-id-column.md) established, and its value there was precisely in refusing to guess.
- The B2B/organizations product and the B2C/user product may differ on this. Our buyer is an organization with multiple logins, so **organization-scoped billing** is the relevant surface.
- A "yes" that requires the quantity to track member count is a **no** for our purposes. Say so plainly rather than reporting the feature as present.
- Capture findings as `research/14-clerk-billing-per-location.md`, matching the existing research files.

## Done when

Question 1 is answered from primary sources with the other five recorded, and [#15](15-decide-billing-configuration.md) can open knowing whether it is configuring Clerk Billing or specifying a direct Stripe integration.
