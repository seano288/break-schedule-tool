# Can Clerk Billing serve a per-location value metric?

**Ticket:** Research — [#14](../issues/14-research-clerk-billing-per-location.md). [#04](../issues/04-decide-pricing-shape.md) fixed the value metric as **per-location**; [#07](../issues/07-decide-infrastructure-stack.md) settled the provider as **Stripe** and the auth layer as **Clerk**. The map has flagged since #07 that Clerk Billing "bills per org *member*, but the value metric is *locations*." This is that verification.
**Date:** 2026-08-07
**Sources:** `clerk.com/docs` (including the `.md` source of each page, fetched directly), `clerk.com/pricing`, `clerk.com/billing`, and `clerk.com/changelog`. Nothing here is drawn from a blog post, a comparison site, or a forum. Where a capability could not be confirmed from a Clerk-owned page it is marked **unconfirmed** rather than inferred.

**Currency check:** Clerk's changelog's most recent entry at time of reading is **Aug 6, 2026** ([changelog](https://clerk.com/changelog)), so the docs read here are current to within a day. Clerk Billing is a young, fast-moving product — every Billing docs page carries the standing banner *"Billing regularly introduces new features and UI changes to Clerk's components"* ([seat-based Plans](https://clerk.com/docs/guides/billing/seat-based-plans)) — so this document has a short shelf life and should be re-checked before #15 is built, not merely before it is decided.

---

## Bottom line

**No. Clerk Billing cannot express one `per_unit` price × N self-declared locations.**

Clerk Billing has exactly one quantity concept — **seats** — and seats are defined as Organization *members*. There is no metered, usage-based, or generic per-unit price a developer can set to an arbitrary business quantity. Clerk says so itself, in its own FAQ on its own Billing product page:

> **"Not yet, but usage-based billing is a top priority on our roadmap."**
> — [clerk.com/billing](https://clerk.com/billing), FAQ, read 2026-08-07

There is one near-miss worth stating precisely, because a superficial read of the API would suggest a "yes": **you can pass an arbitrary `seatsQuantity` at checkout.** You cannot keep it. At every renewal Clerk overwrites it with the member count:

> "At the beginning of each new billing period, the Subscription's seat quantity is **automatically adjusted to match the number of members currently in the Organization** (subject to any included-seat minimums) before the renewal charge is calculated."
> — [Seat-based Plans → Recurring billing](https://clerk.com/docs/guides/billing/seat-based-plans)

So the ticket's concrete failure case plays out exactly as feared: the 10-location chain with 3 logins is billed for 10 in month one and **3 from month two onward**. And the second failure case is worse than feared — see Finding 3: seats are simultaneously the Organization's **membership cap**, so billing a single-location customer for 1 would lock them to **one login**, not eight.

Per the ticket's own rule — *"a 'yes' that requires the quantity to track member count is a **no** for our purposes"* — this is a no, twice over.

**#15 is therefore a direct Stripe integration, not a Clerk Billing configuration.** Details in the last section.

---

## Finding 1 — Confirmed: Clerk Billing has no usage-based or metered pricing

This is the crux, and Clerk answers it directly rather than by omission.

**The product page FAQ.** Asked whether it supports usage-based billing: *"Not yet, but usage-based billing is a top priority on our roadmap."* [Source](https://clerk.com/billing)

**The pricing page says the same in passing**, in the fine print under the Billing fee: *"All features included for subscription billing **(usage and per seat billing coming soon)**"* [Source](https://clerk.com/pricing) — *note this line is stale on the "per seat" half; per-seat shipped on [2026-06-10](https://clerk.com/changelog/2026-06-10-per-seat-plans) and the Billing page lists it as Live. Treat the pricing page's roadmap parenthetical as an unmaintained marketing string, not as evidence. The [clerk.com/billing](https://clerk.com/billing) FAQ is the load-bearing citation.*

**The docs corroborate by absence.** The complete Billing guide index is five pages — Overview, Billing for B2C, Billing for B2B, **Seat-based Plans**, Free trials, Account credits, Custom Plans and prices, Default Plans ([docs sitemap](https://clerk.com/docs/llms.txt)). There is no metering page, no usage-record page, no "report usage" API.

**The type system contains a tantalising generic that is not, in fact, generic.** `BillingPlanUnitPrice` is described as *"unit pricing for a specific unit type (e.g., seats) on a plan"* with fields `blockSize`, `name` (*"The unit name, for example `seats`"*), and `tiers` ([Source](https://clerk.com/docs/nextjs/reference/types/billing-plan-unit-price)). Its sibling `BillingPerUnitTotalTier` is *"a tiered pricing structure for billing based on unit usage"* ([Source](https://clerk.com/docs/nextjs/reference/types/billing-per-unit-total-tier)). This is plainly the substrate Clerk will build usage-based billing on. **But no documented Dashboard control or API defines a unit type other than `seats`**, and the Plan-creation flow ([Seat-based Plans](https://clerk.com/docs/guides/billing/seat-based-plans)) offers only *Seat-based* / *Per-seat fee* / *Cost per member seat monthly* / *Included seats*. Whether a non-`seats` unit can be created is **unconfirmed** — and given the FAQ says usage-based is not shipped, the honest reading is that it cannot.

---

## Finding 2 — Confirmed: the seat quantity is derived from membership, with one transient exception

**The exception, stated first because it is the thing that could mislead #15.** Both the checkout hook and the checkout button accept an explicit quantity:

- `useCheckout()` / `<CheckoutProvider />` param: **`seatsQuantity?: number` — "The number of total seats to check out for"** ([Source](https://clerk.com/docs/nextjs/reference/hooks/use-checkout))
- `<CheckoutButton />` prop: **`seatsQuantity?: number` — "The total number of seats to check out for"**, alongside **`for?: 'user' | 'organization'`** ([Source](https://clerk.com/docs/nextjs/reference/components/billing/checkout-button))

So at the *initial* checkout you genuinely can say "bill this org for 10" while the org has 3 members. That is the whole of the good news.

**The rule that destroys it.** From the same guide, in full:

> "At the beginning of each new billing period, the Subscription's seat quantity is automatically adjusted to match the number of members currently in the Organization (subject to any included-seat minimums) before the renewal charge is calculated. This means that seats that were purchased but never occupied during the previous billing period **will not automatically renew**."
>
> "This automatic seat adjustment will never reduce the Organization's seats below what it still needs. **If the Plan has no per-seat fee, no seat adjustment is made.** If the Plan includes free seats, the seat count will not be reduced below the number of included seats."
> — [Seat-based Plans → Recurring billing](https://clerk.com/docs/guides/billing/seat-based-plans)

Read the two carve-outs carefully, because they are the only places a workaround could hide, and neither holds:

1. *"If the Plan has no per-seat fee, no seat adjustment is made."* — true, but a plan with no per-seat fee is a flat-price plan. You cannot charge per location on it. This carve-out buys nothing.
2. *"the seat count will not be reduced below the number of included seats."* — **Included seats is a Plan-level constant, not a per-customer attribute.** It is configured once, on the Plan, in the Dashboard: *"**Included seats**: Enter how many seats are included in the Plan before per-seat charges apply."* ([Source](https://clerk.com/docs/guides/billing/seat-based-plans)). To pin a customer's floor at 10 you would need a Plan whose included-seat count is 10 — i.e. **one Plan per location count**. That is not a per-unit price; it is a price book with N SKUs, and it collapses at the first customer with 40 stores.

**Net:** the billed quantity is member-derived at every renewal. The self-declared location count has nowhere to live.

---

## Finding 3 — Confirmed: seats are also the Organization's member cap, which breaks the *other* failure case

This is the finding the ticket did not anticipate, and it is the sharper of the two.

Purchased seats do not merely price the subscription — they **gate membership**:

> "Organizations can invite members up to their purchased seat count. Once all seats are occupied, additional invitations will be blocked until one of the following happens: Additional seats are purchased / Existing members are removed from the Organization / Pending invitations are revoked."
>
> "When an Organization is on a seat-based Plan, **you cannot manually set the Organization's seat limit.**"
> — [Seat-based Plans → Seat limit management](https://clerk.com/docs/guides/billing/seat-based-plans)

Apply that to #04's single-location customer with 8 managers. Billing them for **1** location means `seatsQuantity: 1`, which means **the org may have exactly one member**. Their other seven managers cannot be invited. Clerk would be enforcing our *pricing* metric as an *access* limit — the two are welded together and there is no documented way to unweld them.

The same weld bites the 10-location chain from the other side: seats bought to represent locations would silently raise their login cap to 10, and adding an 11th login would trigger a checkout for an 11th "location". Two unrelated business quantities, one field.

**Additional constraints confirmed on the same page**, all of which matter to #04's self-serve quantity control:

- *"Purchased seats **cannot be reduced mid-period**."* — so no self-serve decrease at all. A chain closing a store waits for renewal.
- Increasing requires a member-add flow: *"If an Organization has no unused seats left, when the user tries to add a new member, they will be prompted to purchase an additional seat."* The trigger is **adding a member**, not typing a number.
- The purchaser needs `org:sys_billing:read` and `org:sys_billing:manage` System Permissions (admins have them by default).
- *"If a member is removed mid-billing period, the seat becomes available for reuse within the Organization and persists on the Subscription until renewal."*
- The B2B Authentication add-on is required *"to set a custom limit greater than 20 seats or to allow unlimited members"* — a real cost line for a chain of any size (see Finding 6).

---

## Finding 4 — Answering the ticket's other five, on the assumption they still matter

Recorded because #15 will re-ask each of these of **Stripe**, and it is useful to know the bar Clerk sets.

### (2) Self-serve quantity control — **No, not in the sense #04 requires**

There is no "change my location count" control. The only quantity levers are: buy seats at checkout, buy more by adding a member, and wait for renewal to shed unused ones. Downward change mid-period is explicitly impossible ([Source](https://clerk.com/docs/guides/billing/seat-based-plans)). **Proration is confirmed and automatic on increases only:** *"Additional seats are added to the existing Subscription and are **prorated based on the amount of time that has passed in the current billing period**."* ([Source](https://clerk.com/docs/guides/billing/seat-based-plans)); the changelog restates it as *"prorated automatically, ensuring organizations only pay for the time those seats are in use"* ([Source](https://clerk.com/changelog/2026-06-10-per-seat-plans)).

A self-service surface does exist for viewing/cancelling — `<SubscriptionDetailsButton />`, *"allowing users to view and manage their Subscription details, whether for their Personal Account or Organization"* ([Source](https://clerk.com/docs/nextjs/reference/components/billing/subscription-details-button)) — but the docs do not document seat editing inside it, and it is exported from `@clerk/nextjs/**experimental**`. Whether that drawer exposes a seat-count editor is **unconfirmed**.

### (3) 14-day trial, no card up front — **Yes, fully supported**

The clearest "yes" in this document.

- Trial length is per-Plan and free-form: *"Enable **Free trial** and set the number of trial days (**minimum is 1 day**)."* → 14 is fine. [Source](https://clerk.com/docs/guides/billing/free-trials)
- Card requirement is an instance-level toggle: *"**By default, users must provide a payment method to start a free trial.** … You can disable this requirement to allow users to start a free trial without entering payment details during checkout"* via Dashboard → Billing Settings → **Require payment method for free trials**. [Source](https://clerk.com/docs/guides/billing/free-trials) · shipped [2025-10-30](https://clerk.com/changelog/2025-10-30-start-free-trials-without-payment-methods)
- **But note the conversion consequence**, which is exactly #04's "card collected at conversion" and is *not* automatic: *"If you disable this requirement, users who don't add a payment method during checkout won't be automatically charged when their trial ends. They'll need to add a payment method and **manually subscribe** to continue."* [Source](https://clerk.com/docs/guides/billing/free-trials)
- Eligibility is once-only: *"Only users who have never paid for a Subscription and have never used a free trial can start a free trial."*
- Trial state is observable server-side: listen for `subscriptionItem.active` with `data.is_free_trial === true`; `subscriptionItem.freeTrialEnding` fires 3 days out (immediately if the trial is shorter than 3 days). [Source](https://clerk.com/docs/guides/billing/free-trials)

**Carry this requirement to the Stripe spec verbatim** — it is well-specified and Stripe supports it natively via `trial_period_days` + `payment_behavior`.

### (4) Monthly + discounted annual on one product — **Yes**

> "Yes, you can offer subscribers the option to pay annually, at a discounted monthly price. Annual pricing for your Plans can be configured from the **Subscription plans** page in the Clerk Dashboard. Customers can choose between monthly or annual billing when subscribing."
> — [Billing FAQ](https://clerk.com/docs/guides/billing/overview)

The period is a first-class field throughout: `planPeriod: "month" | "annual"` on the Subscription Item, the checkout hook, and the checkout button ([Backend `BillingSubscriptionItem`](https://clerk.com/docs/reference/backend/types/commerce-subscription-item) · [`useCheckout()`](https://clerk.com/docs/nextjs/reference/hooks/use-checkout)). Mid-cycle moves: *"Plan upgrades will take effect immediately, while downgrades take effect at the end of the current billing cycle."* ([Billing FAQ](https://clerk.com/docs/guides/billing/overview)).

### (5) What reaches a Cloudflare Workers backend — **A good surface, and it is runtime-compatible**

**Runtime, confirmed:** *"`@clerk/backend` is built for **Node.js/V8 isolates (Cloudflare Workers, Vercel Edge Runtime, etc.)**"* — [Source](https://clerk.com/docs/guides/development/sdk-development/backend-only). So the whole of this section works from a Worker. This is worth banking regardless of the billing verdict: it de-risks [#09](../issues/09-define-compute-api-surface.md)'s `requireEntitlement()` on the auth side.

**Webhook events, complete list, verbatim** — [Source](https://clerk.com/docs/guides/development/webhooks/billing):

| Group | Events |
| --- | --- |
| Subscription (one per payer) | `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.pastDue` |
| Subscription Item (payer × Plan) | `subscriptionItem.updated`, `subscriptionItem.active`, `subscriptionItem.canceled`, `subscriptionItem.upcoming`, `subscriptionItem.ended`, `subscriptionItem.abandoned`, `subscriptionItem.incomplete`, `subscriptionItem.pastDue`, `subscriptionItem.freeTrialEnding` |
| Payment | `paymentAttempt.created`, `paymentAttempt.updated` (each carries `type: 'checkout' | 'recurring'`) |

Two details that would have been genuinely useful to an entitlement path: *"There can only be one `active` Subscription Item per payer and Plan"*, and *"the Subscription Item for the default Plan will always have the same `id` to allow easier tracking of which users and Organizations are not paid customers."*

**Synchronous check.** `auth().has({ plan: 'gold' })` / `has({ feature: 'widgets' })` returns a boolean server-side, reading the session token claims — signature `has(isAuthorizedParams: CheckAuthorizationParamsWithCustomPermissions): boolean` with `role` / `permission` / `feature` / `plan` ([Auth object](https://clerk.com/docs/reference/backend/types/auth-object) · [Billing for B2B](https://clerk.com/docs/nextjs/guides/billing/for-b2b)). Because it reads the JWT rather than calling out, it is free in a Worker — no network hop per request. One documented coupling: *"If you have both Organizations and Billing enabled, a Permission check will only work if the Feature part of the Permission key (`org:<feature>:<permission>`) is a Feature included in the Organization's active Plan."* ([Source](https://clerk.com/docs/guides/secure/authorization-checks))

**The Backend API's Billing surface is read-only, and this is decisive for Finding 2.** The complete list of `clerkClient` Billing methods, from Clerk's own docs index ([Source](https://clerk.com/docs/llms.txt)):

- `getPlanList()`
- `getUserBillingSubscription()` → wraps `GET /users/{user_id}/billing/subscription`
- `getOrganizationBillingSubscription()` → wraps `GET /organizations/{organization_id}/billing/subscription` ([Source](https://clerk.com/docs/reference/backend/billing/get-organization-billing-subscription))
- `cancelSubscriptionItem()`
- `extendSubscriptionItemFreeTrial()`

Three reads, a cancel, and a trial extension. **There is no `updateSubscriptionItem()` and no method that sets a quantity.** So even a server-side workaround — "let the customer type a location count, then push it to the subscription from the Worker" — has no endpoint to call.

The read model confirms the same shape: `BillingSubscriptionItem` carries `amount`, `planId`, `planPeriod`, `priceId`, `status`, `isFreeTrial`, period timestamps — and for quantity, only `seats?: BillingSubscriptionItemSeats`, described as *"Seat entitlement details for organization subscription items with **seat-based billing**"* ([Source](https://clerk.com/docs/reference/backend/types/commerce-subscription-item)), whose own `quantity` field is *"The **seat limit** active while the parent subscription item was active. `null` means unlimited"* ([Source](https://clerk.com/docs/nextjs/reference/types/billing-subscription-item-seats)). Note the wording: it is a *seat limit*, not a billed unit count — the membership-cap weld from Finding 3, showing up in the type system.

### (6) Fees — **0.7% of billing volume on top of Stripe**

> "**0.7% of billing volume**" — "Stripe 2.9% + Stripe transaction charge $0.30 + **Clerk Billing 0.7%**"
> — [clerk.com/pricing](https://clerk.com/pricing)

Clerk's own product page states the all-in as **3.6% + $0.30** for US cards and positions it against Polar (4.5% + $0.40) and Paddle (5% + $0.40) ([Source](https://clerk.com/billing)).

**Against #07's ~$56/yr margin, this is material and it scales the wrong way.** 0.7% is a *percentage of revenue*, not a fixed fee: it costs $7/yr per $1,000 of ARR, $70/yr at $10k ARR, $700/yr at $100k ARR. #07's margin was a fixed number; this is a slope. Direct Stripe pays 2.9% + $0.30 and nothing else.

**Clerk's own plan pricing** (from [clerk.com/pricing](https://clerk.com/pricing)), which is a cost either way since #07 already chose Clerk for auth:

- **Hobby** free — 50,000 MRU (monthly retained users) per app, up to 3 dashboard seats, up to 5 user impersonations
- **Pro** $25/mo ($20/mo billed annually) — 50,000 MRU included, then $0.02/mo each for 50,001–100,000
- **Business** $300/mo ($250/mo annually) — 10 dashboard seats included, additional $20/mo each
- **Enterprise** custom, annual billing only

**Organization (MRO) costs, which apply to us because our buyer is an org:**

- **100 MROs included per app** on all plans. An MRO is *"retained when it has at least 2 members and at least one of those members is a retained user."*
- **B2B Authentication enhanced add-on: $100/mo ($85/mo billed annually)**, then volume pricing — 101–1,000 at $1/mo each, 1,001–10,000 at $0.90, 10,001–100,000 at $0.75, 100,001+ at $0.60.

**Note the interaction with Finding 3:** the same add-on is what unlocks seat limits above 20 — *"The B2B Authentication add-on is required to set a custom limit greater than 20 seats or to allow unlimited members"* ([Source](https://clerk.com/docs/guides/billing/seat-based-plans)). Had the seat hack worked, any customer with more than 20 locations would have pushed us onto a $100/mo add-on. It is worth noting that the 100-free-MRO ceiling is the real cost cliff for a B2B product regardless of which billing rail we pick.

---

## Finding 5 — Five other Clerk Billing constraints worth carrying to #15

These came up while reading and are cheap to record now. All from the [Billing FAQ](https://clerk.com/docs/guides/billing/overview) unless noted. Several are strong independent reasons to prefer direct Stripe even if the quantity question had gone the other way.

1. **Clerk Billing is not Stripe Billing, and nothing syncs.** *"Clerk Billing is a separate product from Stripe Billing; **Plans and Subscriptions made in Clerk are not synced to Stripe**."* and *"Can I see Subscriptions in my Stripe account? **No.**"* This is a bigger deal than it sounds: it means Clerk Billing is not a thin wrapper we could later peel off to reach the Stripe objects underneath. Adopting it and migrating out later is a **re-subscription of every customer**, not a config change.
2. **USD only.** *"Clerk Billing currently supports only USD as the billing currency"*, regardless of the connected Stripe account's country. Support for other currencies is "on our roadmap."
3. **No refunds.** *"Clerk Billing does not support refunds at this time."* You can refund in Stripe, but *"refunds performed in Stripe will not be reflected in income/MRR calculations."*
4. **No tax/VAT.** *"Clerk Billing does not currently support tax or VAT, but these are planned."* (Direct Stripe has Stripe Tax.)
5. **No 3D Secure — and it interacts badly with trials.** *"Payments that require a 3DS challenge **will fail** because Clerk Billing cannot prompt users to complete the authentication step… This limitation is particularly relevant in the UK and EU and may affect free trials, since renewal charges are processed in the background."* Also: Clerk is **not** a Merchant of Record, so #07's MoR reasoning is unchanged either way. Billing is also unavailable in Brazil, India, Malaysia, Mexico, Singapore, and Thailand.

---

## What could NOT be confirmed from primary sources

Recorded in #08's spirit — these are the things a builder must resolve against a live Clerk instance or Clerk support, not against docs. **None of them changes the verdict**; #1 is the only one that could, and Clerk's own FAQ says it does not exist.

1. **Whether a Plan can define a unit type other than `seats`.** The `BillingPlanUnitPrice.name` field is generic (*"The unit name, for example `seats`"*) and `BillingPerUnitTotalTier` exists, but no documented Dashboard control or API creates a non-seat unit, and the FAQ says usage-based billing is not shipped. Undocumented ≠ absent, but here Clerk has affirmatively said "not yet."
2. **Whether the `<SubscriptionDetailsButton />` drawer lets a customer edit their seat count directly**, as opposed to only viewing and cancelling. Not documented on the component page.
3. **Whether `seatsQuantity` can exceed current membership at checkout without erroring.** The parameter is documented; no page states a validation rule against member count. Only the *renewal* reset is documented. If you want to be certain the near-miss is a near-miss rather than an outright rejection, this is a five-minute test on a dev instance — but it does not matter, because the renewal reset kills it either way.
4. **Whether the `subscriptionItem.*` webhook payload includes the seat quantity.** The events guide names `period_start`, `period_end`, `status`, `is_free_trial`, and `type` in its descriptions but publishes no example payload or field list ([Source](https://clerk.com/docs/guides/development/webhooks/billing)). The Backend read model has `seats.quantity`, so it very likely does — **inferred, not confirmed.**
5. **Whether `has({ plan })` reflects a plan change immediately or only after the session token refreshes.** `has()` reads session claims ([Auth object](https://clerk.com/docs/reference/backend/types/auth-object)); no page states the propagation delay after a subscription change. This is a real question for any token-claim-based entitlement check, **including the Stripe design** — if #15 gates on a Clerk claim it must know the staleness window; if it gates on our own store, it must know the webhook lag. Worth resolving in #15 either way.
6. **Whether Clerk's 0.7% applies to the gross or the net of Stripe's cut.** The pricing page says "0.7% of billing volume" without defining "billing volume." Immaterial at our scale, but do not quote a precise all-in without checking.
7. **Whether Clerk's Billing React components can be used at all outside their supported SDKs.** All Billing component and hook references are published per-SDK (Next.js, React, Expo, React Router, TanStack, Nuxt, js-frontend); [#07](../issues/07-decide-infrastructure-stack.md)'s frontend choice should be checked against that list if any Clerk UI is wanted. Note also that the Billing components are exported from `@clerk/nextjs/experimental` ([Source](https://clerk.com/docs/nextjs/reference/components/billing/subscription-details-button)).

---

## What this means for #15

**#15 is specifying a direct Stripe integration. It is not configuring Clerk Billing.**

This is not a close call and #15 should not spend time re-litigating it. Clerk Billing has no per-unit quantity that is not `seats`, `seats` means Organization members, the member count overwrites the checkout quantity at every renewal, and the same number simultaneously caps how many people can log in. There is no configuration, no plan shape, and no Backend API call that separates the two. Clerk's own answer to "do you support usage-based billing" is *"not yet."*

The provider choice is **not** reopened — [#07](../issues/07-decide-infrastructure-stack.md) already chose Stripe and already accepted the merchant-of-record consequences. What this changes is only **how much we build**, exactly as the ticket framed it.

### What Clerk still does for us — unchanged, and still worth its price

- **Authentication and the sign-up/sign-in components.** The whole reason #07 picked Clerk. Untouched by this finding.
- **Organizations as the customer object.** Orgs, memberships, invitations, roles, admin/member defaults. This is our account model and it survives intact — we simply stop asking it to also be our pricing model.
- **`org_id` as the billing key.** The Clerk Organization ID is the natural primary key to map onto a Stripe Customer. One `org_id` ↔ one `stripe_customer_id`.
- **A Workers-compatible backend SDK.** `@clerk/backend` is *"built for Node.js/V8 isolates (Cloudflare Workers, Vercel Edge Runtime, etc.)"* ([Source](https://clerk.com/docs/guides/development/sdk-development/backend-only)) — confirmed, and the load-bearing fact for [#09](../issues/09-define-compute-api-surface.md)'s `requireEntitlement()`. Request authentication and `orgId` extraction work in the Worker with no shim.
- **A cost note:** dropping Clerk Billing drops the **0.7% of billing volume**. Clerk's per-MAU/MRU and MRO pricing still applies, since we keep auth and orgs. The 100-free-MRO ceiling remains the cost cliff to watch.
- **One thing we should now *avoid*:** do **not** put a seat-based Plan on the Clerk Organization, even a free one, and do not enable Clerk Billing "just for the components." Enabling it welds a membership cap onto the org (Finding 3) and creates Subscription objects Clerk will not sync to Stripe (Finding 5.1). Keep entitlement entirely on our side of the line.

### What we own ourselves

Each of these was going to be free if the answer had been yes. It is not, so scope #15 for all six:

1. **Stripe product + prices.** One product, one `per_unit` recurring price, two intervals (`month` and a discounted `year`). Stripe's native `quantity` on a subscription item is exactly the primitive Clerk lacks — this is the easy part.
2. **Checkout.** Stripe Checkout Session with `quantity: N`, `trial_period_days: 14`, and no payment method collected up front (`payment_method_collection: 'if_required'` or the equivalent trial setting). #04's entry path maps cleanly onto Stripe primitives; carry the exact requirements from Finding 4(3) — 14 days, no card, card at conversion — into the spec.
3. **Quantity control.** Either Stripe's hosted Customer Portal with quantity updates enabled, or our own "how many locations?" control writing through to the subscription item. Decide which in #15. Proration is Stripe's `proration_behavior`, and unlike Clerk it works **in both directions** — a chain closing a store gets credited, which Clerk explicitly cannot do (*"Purchased seats cannot be reduced mid-period"*).
4. **Customer portal.** Stripe's hosted portal for payment method, invoices, cancellation. Cheap; do not build our own.
5. **The webhook → entitlement path.** A Worker route verifying Stripe signatures and persisting entitlement state keyed by `org_id`. The events are the Stripe analogues of Clerk's list: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`. **Two Worker-specific notes for the spec:** Stripe signature verification must use the async/WebCrypto constructor (`constructEventAsync`) rather than the synchronous Node one, and #09 should confirm the Stripe SDK's Fetch HTTP client is selected — both are known V8-isolate requirements and should be verified against Stripe's docs in #15, not assumed from this document.
6. **Somewhere to store entitlement.** [#03](03-managed-platform-landscape.md) recorded that this app has **no database** — that was a real simplicity win and this is the first thing to threaten it. Clerk Billing would have carried entitlement in the session token for free via `has({ plan })`. Now #15 must decide where `org_id → { plan, locationCount, status, periodEnd }` lives. **The cheapest option that preserves the no-database property is Clerk Organization `publicMetadata` / `privateMetadata`, written by the Stripe webhook handler via `@clerk/backend` and read back through the session claims** — which would keep `requireEntitlement()` a claims read with no network hop, exactly as Clerk Billing would have. That is a genuine design question with a real trade-off (staleness, write contention, metadata as a database), and it is the single most consequential thing #15 decides. It is **unverified** here — flagged as the design question, not as a recommendation.

**One-line brief for #15:** *Clerk keeps auth and orgs; Stripe gets the entire billing surface; the open design question is where entitlement state lives now that we cannot lean on `has({ plan })`.*
