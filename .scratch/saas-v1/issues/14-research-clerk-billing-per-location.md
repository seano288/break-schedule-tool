# Can Clerk Billing serve a per-location value metric?

Type: research
Status: resolved

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

---

## Answer

**No — and not narrowly. #15 is specifying a direct Stripe integration, not configuring Clerk Billing.**

Findings: [`research/14-clerk-billing-per-location.md`](../research/14-clerk-billing-per-location.md), read against `clerk.com/docs`, `clerk.com/pricing`, `clerk.com/billing` and the changelog on 2026-08-07 (Clerk's changelog's most recent entry that day, so current to within a day).

### 1. The crux — Clerk has exactly one quantity, and it is members

Clerk Billing has no metered, usage-based, or generic per-unit price. Clerk says so in its own FAQ: **"Not yet, but usage-based billing is a top priority on our roadmap."** ([clerk.com/billing](https://clerk.com/billing)). The only quantity concept is **seats**, and seats are Organization members.

**The near-miss that would have fooled a shallow read, stated precisely because #15 must not re-discover it:** `useCheckout()` and `<CheckoutButton />` both accept **`seatsQuantity`** — *"the total number of seats to check out for."* At *initial checkout* you genuinely can bill an org for 10 while it has 3 members. You cannot keep it:

> "At the beginning of each new billing period, the Subscription's seat quantity is **automatically adjusted to match the number of members currently in the Organization**… before the renewal charge is calculated."
> — [Seat-based Plans](https://clerk.com/docs/guides/billing/seat-based-plans)

So the ticket's failure case plays out exactly as feared: the 10-location chain with 3 logins bills 10 in month one and **3 from month two**. Both documented carve-outs were checked and neither hides a workaround — "no per-seat fee" means a flat price (nothing to bill per location on), and *included seats* is a **Plan-level constant**, so pinning a customer's floor at 10 means one Plan per location count: a price book with N SKUs that collapses at the first 40-store customer.

**No API escape hatch.** The entire Backend Billing surface is `getPlanList`, `getUserBillingSubscription`, `getOrganizationBillingSubscription`, `cancelSubscriptionItem`, `extendSubscriptionItemFreeTrial` — three reads, a cancel, a trial extension. **There is no quantity setter**, so even "let the customer type a number and push it from the Worker" has nothing to call.

### 2. The finding this ticket did not anticipate — seats are also the login cap

Sharper than the crux, and it kills the idea independently:

> "Organizations can invite members up to their purchased seat count… When an Organization is on a seat-based Plan, **you cannot manually set the Organization's seat limit.**"
> — [Seat-based Plans](https://clerk.com/docs/guides/billing/seat-based-plans)

So #04's single-location customer with 8 managers, billed correctly for **1**, would be **locked to one login**. Clerk would enforce our *pricing* metric as an *access* limit; the two are one field and there is no documented way to unweld them. It bites from the other side too — seats bought to mean locations silently raise the login cap, and adding an 11th login triggers a checkout for an 11th "location".

Per this ticket's own rule — *a "yes" that requires the quantity to track member count is a no* — this is a no twice over.

### 3. The other five, recorded because #15 re-asks each of them of Stripe

- **Self-serve quantity control — no**, in the sense #04 requires. *"Purchased seats cannot be reduced mid-period"*; increases are triggered by **adding a member**, not by typing a number. Proration is automatic **on increases only**. (Stripe prorates in both directions — a chain closing a store gets credited.)
- **14-day trial, no card up front — yes**, the clearest yes here. Per-Plan trial days (min 1) plus an instance toggle *"Require payment method for free trials"*. **But conversion is manual**: *"users who don't add a payment method during checkout won't be automatically charged when their trial ends. They'll need to add a payment method and manually subscribe."* Carry the requirement to the Stripe spec verbatim — Stripe does this natively.
- **Monthly + discounted annual — yes**, `planPeriod: "month" | "annual"` is first-class throughout.
- **Workers-compatible — yes, and worth banking regardless of this verdict.** `@clerk/backend` is *"built for Node.js/V8 isolates (Cloudflare Workers, Vercel Edge Runtime, etc.)"*, and `auth().has(…)` reads session-token claims with **no network hop**. That de-risks [#09](09-define-compute-api-surface.md)'s `requireEntitlement()` on the auth side independently of billing. 15 billing webhook events are documented.
- **Fees — 0.7% of billing volume on top of Stripe's 2.9% + $0.30.** [#07](07-decide-infrastructure-stack.md) chose Stripe on a **fixed** ~$56/yr margin; this is a **slope**, not a number — $70/yr at $10k ARR, $700/yr at $100k. It scales the wrong way.

### 4. Five further constraints that argue for direct Stripe even had the answer been yes

From the [Billing FAQ](https://clerk.com/docs/guides/billing/overview): **Clerk Billing subscriptions do not sync to Stripe** (*"Plans and Subscriptions made in Clerk are not synced to Stripe"* / *"Can I see Subscriptions in my Stripe account? No."*) — so it is **not a thin wrapper we could peel off later**; migrating out means re-subscribing every customer. Also **USD only**, **no refunds**, **no tax/VAT** (direct Stripe has Stripe Tax — relevant to the sales-tax obligation #07 accepted), and **no 3D Secure**, which *"may affect free trials, since renewal charges are processed in the background"* in the UK/EU. Clerk is **not** a merchant of record either way, so #07's MoR reasoning is untouched.

### 5. What this costs us — one thing, and it is the real one

Clerk Billing would have carried entitlement **in the session token for free** via `has({ plan })`. Dropping it means **[#15](15-decide-billing-configuration.md) must now decide where `org_id → { plan, locationCount, status, periodEnd }` lives** — and [#03](03-managed-platform-landscape.md) recorded that this app has **no database**, which was a real simplicity win and is the first thing to threaten it. The option that would preserve the no-database property is Clerk Organization `privateMetadata`, written by the Stripe webhook and read back through session claims (keeping `requireEntitlement()` a claims read, no network hop). Recorded as **the design question #15 owns, explicitly not as a verified recommendation** — it has real trade-offs (staleness, write contention, metadata-as-database).

### 6. One build constraint falls out

**Do not enable Clerk Billing at all** — not even a free Plan, not "just for the components." Enabling it welds a membership cap onto every Organization (finding 2) and creates Subscription objects Clerk will not sync to Stripe (finding 4). Entitlement stays entirely on our side of the line.

### 7. A cost cliff worth knowing, unrelated to the verdict

Clerk includes **100 MROs** (monthly retained organizations) per app on all plans; beyond that the **B2B Authentication add-on is $100/mo** ($85 annual) plus volume pricing. Our buyer is an organization, so **MRO, not MAU, is the cost cliff** — at ~101 paying customers. Far beyond the invite-only beta, so it raises no ticket; recorded so nobody re-derives it when pricing gets revisited.

### Unconfirmed

Seven items are listed in the research file. **None changes the verdict** — the only one that could (whether a Plan can define a non-`seats` unit type) is the exact thing Clerk's FAQ affirmatively says is not shipped. Two are worth carrying into #15 rather than closing here: whether the `subscriptionItem.*` webhook payload carries the seat quantity (inferred, not confirmed — moot under direct Stripe), and **whether `has({ plan })` reflects a plan change immediately or only after the session token refreshes** — that one is live for *any* claim-based entitlement check, **including the Stripe design**, so #15 must know its staleness window either way.
