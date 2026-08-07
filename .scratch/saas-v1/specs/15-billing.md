# Billing spec — Stripe objects, entitlement path, lifecycle

**Source:** [`#15 Decide the billing configuration`](../issues/15-decide-billing-configuration.md). Reasoning lives there; this file is the buildable detail. Upstream constraints come from [#04](../issues/04-decide-pricing-shape.md) (per-location, self-declared, unlimited runs, 14-day no-card trial, monthly + discounted annual), [#07](../issues/07-decide-infrastructure-stack.md) (Stripe, Cloudflare Workers + Clerk, billing dormant during the invite-only beta) and [#14](../issues/14-research-clerk-billing-per-location.md) (direct Stripe, **not** Clerk Billing).

Nothing here is built. This is spec, written against a system that does not exist yet.

---

## 1. The line

**Clerk owns** authentication, Organizations, membership and roles. `org_id` is the tenant key everywhere — billing, [#12](../issues/12-define-observability-without-pii.md)'s telemetry index, and the entitlement record.

**Stripe owns** the entire billing surface: product catalogue, subscriptions, quantity, trials, dunning, invoices, the customer portal.

**Clerk Billing is not enabled.** Not for the components, not as a free Plan. Enabling it welds a membership cap onto every Organization and creates Subscription objects Clerk does not sync to Stripe ([#14](../issues/14-research-clerk-billing-per-location.md)).

**Clerk Organization metadata is the entitlement cache** — a projection of Stripe state, never the source of truth. Stripe is always authoritative; the cache is rebuildable from Stripe at any time by replaying §6.

---

## 2. Stripe objects to create

### Product

One Product. `unit_label: "location"` — Stripe renders it as "per location" in Checkout, the portal, and on invoices.

### Prices

Two, both on that Product, both `billing_scheme: per_unit`, `currency: usd`.

| Price | `recurring.interval` | Amount |
|---|---|---|
| Monthly | `month` | `unit_amount` = **M** |
| Annual | `year` | `unit_amount` = **10 × M** |

**M is a build-time input, not a spec decision.** [#04](../issues/04-decide-pricing-shape.md) deferred the dollar figure and nothing since has forced it; the structure, the interval pair and the discount *ratio* are fixed here so the number is the only blank.

The annual price is ten months' money for twelve months' service — ≈17% off, the SaaS convention. Both prices carry the same `quantity` semantics: **quantity = the customer's self-declared location count.**

**USD only.** Not inherited from Clerk's limitation — a deliberate v1 scope call. Multi-currency is real work and there is no non-US customer.

### Coupon — beta comp

One Coupon: `percent_off: 100`, `duration: forever`. Applied to every beta org's subscription (§7.1). It is removed by hand at beta exit, not scheduled — see §7.5.

### Customer portal configuration

Dashboard → Billing → Customer portal. Non-default settings:

| Setting | Value | Why |
|---|---|---|
| **Update quantities** | **On** (default Off) | This *is* #04's self-serve location control. No custom UI. |
| **Prorate subscription updates** | **On, immediate** | Two-way proration — a chain closing a store is credited mid-period. The thing Clerk flatly could not do. |
| **Manage downgrades** | **End of billing period** | Applies to the annual→monthly plan switch only; quantity decreases still prorate immediately. |
| **Switch plan** | **On** (default Off) | Monthly ↔ annual self-serve. Both prices are on one Product, so the portal can offer it. |
| **Cancel subscription** | On (default) | |
| **Payment methods** | On (default) | The trial-conversion path (§7.3) depends on this. |
| **Invoice history** | On (default) | |

### Webhook endpoint

One endpoint on the Worker. Subscribed events — see §6 for why the list is uniform and forgiving:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`

`customer.subscription.trial_will_end` (fires 3 days out) is **not** subscribed in v1 — Stripe's own trial-ending reminder emails cover it, configured under Subscriptions and emails settings with the "Link to a Stripe-hosted page" option pointing at the portal. Subscribe to it when we want to send our own.

---

## 3. Tenancy and roles

- **An Organization is created at signup. There is no personal-account path.** A second account shape would fork `requireEntitlement()`, #12's `tenantId`, and the Stripe mapping, for a customer type [#04](../issues/04-decide-pricing-shape.md) explicitly designed against.
- **One `org_id` ↔ one `stripe_customer_id`.**
- **Checkout and the portal require the Clerk org `admin` role.** `/inspect` and `/schedule` are open to every member — the store manager runs schedules, the ops director pays.
- **Organization membership is uncapped by billing.** Location count and login count are unrelated numbers. This is the failure mode Clerk Billing could not avoid ([#14](../issues/14-research-clerk-billing-per-location.md) Finding 3) and it is the reason we are here.

---

## 4. Entitlement data model

Stored on the Clerk **Organization**, written only by the webhook handler via `@clerk/backend`.

### `publicMetadata` — backend-write, frontend-read, mirrored into session claims

| Field | Type | Notes |
|---|---|---|
| `plan` | `'monthly' \| 'annual'` | derived from the subscription item's price |
| `status` | Stripe subscription status, verbatim | see §5 for the mapping |
| `locationCount` | number | the subscription item's `quantity` |
| `periodEnd` | Unix seconds | `current_period_end` |

Four scalars, far inside Clerk's **1.2 KB custom-claims budget** (8 KB metadata cap overall; claims share a 4 KB cookie with Clerk's default claims — [docs](https://clerk.com/docs/guides/organizations/metadata)).

The client seeing its own subscription state is a feature, not a leak: the frontend renders "trial ends in 3 days" with no API call, and `publicMetadata` is **not** client-writable, so the tamper-proofness that matters is intact.

### `privateMetadata` — backend-only, never a claim

| Field | Notes |
|---|---|
| `stripeCustomerId` | the reverse half of §6's mapping |

**Rule:** anything the customer already knows about their own account is public; anything that identifies our Stripe objects is private. `privateMetadata` is also not a documented claim shortcode, and putting it in a client-delivered token would defeat the word.

### Session claims

Add the four `publicMetadata` fields as **individual** claims in Dashboard → Sessions → Customize session token — never the whole object (size).

> **Verify at build:** the docs give the claim form as `organization.public_metadata.<field>`, but the exact shortcode prefix (`organization.` vs `org.`) is not stated unambiguously on any page read. Confirm against a live instance before wiring `requireEntitlement()`.

---

## 5. `requireEntitlement()`

The single helper [#09](../issues/09-define-compute-api-surface.md) specified, guarding **exactly two handlers** — `POST /inspect` and `POST /schedule` — and nothing else.

**It is a session-claims read. No network hop, no store lookup.** ([#14](../issues/14-research-clerk-billing-per-location.md) confirmed `@clerk/backend` runs in V8 isolates and reads claims without calling out.)

### Verdict

```
entitled   = status ∈ { trialing, active, past_due }
unentitled = status ∈ { paused, unpaid, canceled, incomplete, incomplete_expired }
           | metadata absent
```

**Default deny.** A brand-new org with no entitlement metadata is unentitled.

`past_due` **stays entitled** — that *is* the grace period, run by Stripe's Smart Retries with no code on our side. Cutting off a compliance tool over a card that expired yesterday is the wrong failure. Retry exhaustion moves the subscription to `unpaid`, which is the hard stop.

A cancellation set to `cancel_at_period_end` leaves the status `active` until the period actually ends, so a cancelling customer keeps service they have paid for, automatically.

### Staleness

Bounded at **~60 s**: Clerk's session token is 60 s-lived and the SDK refreshes on a ~50 s interval ([Clerk](https://clerk.com/blog/how-we-roll-sessions)); backend metadata writes are invisible until the next refresh ([Clerk](https://clerk.com/docs/guides/users/extending)).

Accepted deliberately. The worst case is one extra location-week computed by an org whose subscription lapsed a minute ago. Note the option not taken: Cloudflare KV has **the same ~60 s** eventual-consistency window *plus* a read hop, so staleness never discriminated between the two — what did was that this design ships with no new infrastructure at all.

Where an immediate refresh is wanted (right after checkout), the client calls `user.reload()` or `getToken({ skipCache: true })`.

### Beta override

The beta config flag is applied **after** the real verdict, never instead of it:

```
verdict  = computeEntitlement(claims)   // the truth
allowed  = verdict.entitled || env.BETA_GRANT_ALL
```

So #12's telemetry records **both** `entitlementStatus` (what was true) and `betaOverride` (whether the flag saved them). This turns the dormant period into free data — on the day the flag flips off, we already know exactly who would have been locked out — and it means the entitlement logic is genuinely exercised in production rather than short-circuited, which was #09's point in insisting it be "validated and tested, permissive by config."

---

## 6. The webhook handler

### Never trust the payload

Stripe delivers at-least-once and does **not** guarantee ordering. A handler that writes the event's own payload into metadata can flip entitlement backwards when a stale `customer.subscription.updated` lands after a newer one.

**So: on any subscribed event, ignore the payload's subscription data, re-fetch the customer's current subscription from Stripe, and write that.**

This is ordering-immune and self-healing — a dropped event is repaired by the next one, and a manual Dashboard change is picked up for free. It also collapses the event-list problem: **every handler body is identical**, so the subscribed set in §2 is just "tell me when something changed for this customer", and adding or removing an event type is not a code change. The cost is one extra Stripe round-trip inside a webhook, where latency is nobody's problem.

An `event.created` monotonic guard is **not** built in v1. Add it only if a real interleaving shows up — the re-fetch already makes ordering harmless.

### Resolving an event to an org

The event carries `customer`, not `org_id`. The mapping is written in **both directions at creation**, so neither store depends on a third index:

- Stripe Customer `metadata.clerk_org_id` → the Clerk org
- Clerk org `privateMetadata.stripeCustomerId` → the Stripe customer

`client_reference_id` is also set on the Checkout Session as a belt-and-braces path for the very first event, before any mapping exists.

### Handler shape

```
verify signature
  → resolve org_id from customer metadata (or client_reference_id)
  → GET the customer's current subscription from Stripe
  → write publicMetadata { plan, status, locationCount, periodEnd }
  → 200
```

Return 200 fast; Stripe retries anything slower.

> **Verify on first deploy** (carried unconfirmed from [#14](../issues/14-research-clerk-billing-per-location.md), and **not** established by Stripe's own docs — stripe-node's README documents a Deno export target and says nothing about Workers):
> - signature verification must use the **async/WebCrypto** path (`stripe.webhooks.constructEventAsync`), not the synchronous Node one;
> - the SDK's **Fetch HTTP client** must be selected (`Stripe.createFetchHttpClient()`), and possibly `Stripe.createSubtleCryptoProvider()`.
>
> Both are known V8-isolate constraints. Treat them the way [#10](../issues/10-set-per-request-size-ceiling.md) treated its two Workers unknowns: verify on first deploy, do not assume.

---

## 7. Lifecycle

### 7.1 Entry — beta (billing dormant)

Beta orgs go through **real Checkout** with the 100%-off-forever coupon applied. Amount due is 0, so `payment_method_collection: 'if_required'` collects no card. No trial is needed — the coupon is the comp.

This is the point of doing it this way: the entire **checkout → webhook → entitlement** path runs in production, for free, before money is on the line. That path is exactly the new, unproven scope [#14](../issues/14-research-clerk-billing-per-location.md) handed us. The alternative — entitle beta orgs by config flag and never create a Stripe object — means the first production execution of that path happens on the day it can cost a customer money.

It also means **location count is live data from day one**, since beta orgs declare it at checkout like everyone else.

### 7.2 Entry — post-beta

Checkout Session:

```
mode: 'subscription'
line_items: [{ price: <monthly|annual>, quantity: <declared locations> }]
payment_method_collection: 'if_required'
subscription_data.trial_period_days: 14
subscription_data.trial_settings.end_behavior.missing_payment_method: 'pause'
client_reference_id: <org_id>
```

### 7.3 Trial end

`missing_payment_method: 'pause'`, not `'cancel'`.

On pause the subscription stops invoicing, keeps its Customer, its item, its quantity and our `org_id` mapping, and can sit paused indefinitely. Status becomes `paused` → §5 says unentitled → hard stop.

Conversion is then **one click in the portal**: the customer adds a card and selects "Start subscription", which resumes the *same* subscription. `'cancel'` would have destroyed the objects and forced a second checkout — the one moment a converting customer might not.

Stripe's own trial-ending reminder emails, pointed at the portal, do the nudging (§2).

### 7.4 Failed payment and cancellation

Dunning is **Stripe configuration, not our code** — Smart Retries under Subscriptions and emails settings. `past_due` stays entitled for the whole retry window (§5); exhaustion → `unpaid` → hard stop.

**What survives loss of entitlement:** authentication, the portal-session endpoint, and Checkout are **never** gated. Only `/inspect` and `/schedule` are. A lapsed org can still sign in, see its own state (the §4 claims render it), open the portal, add a card and self-resume. Gating the recovery path behind the thing that is broken is the classic version of this bug; it is stated here so it is not left to be inferred from where the helper happens to be called.

### 7.5 Beta exit

The comp is removed **by hand, on an announced date** — not by a fixed-duration coupon that expires quietly in an object nobody will look at again.

Removal makes the next invoice real. Orgs that have not added a card go `past_due`, get Stripe's full retry window (they stay entitled throughout, §5), and only then lapse. Every object — subscription, quantity, mapping — survives the transition intact.

**This owes a written step in the beta-exit checklist**, which the map carries as the *Beta invite/rollout mechanics* fog patch alongside the deferred abuse-limiter.

### 7.6 Changing location count

Hosted portal, "Update quantities". Proration immediate **in both directions** — up *and* down, which is what [#04](../issues/04-decide-pricing-shape.md)'s "change your count anytime" promised and what Clerk Billing structurally could not deliver.

No custom UI. The portal is the infra principle applied literally: a Dashboard toggle against zero lines of code, on a surface we need anyway for payment method and invoices.

---

## 8. Under-declaration

Nothing reads `locationCount` as a gate. A customer can declare 1 and schedule 50 stores. [#04](../issues/04-decide-pricing-shape.md)'s deferral of content-based enforcement **holds**, on the grounds that invite-only means every customer is one you vetted, and honesty-based billing is fine against a cohort you picked.

**Written trigger — what reopens it:** *the first tenant whose `/inspect` distinct-location count exceeds their declared `locationCount` by more than one, for two consecutive weeks.*

At that point what gets built is a **soft warning, never a refusal.** Blocking a legally-required break calculation over a billing dispute is the one failure mode a compliance tool cannot take.

The trigger's existence in writing is what discharges [#12](../issues/12-define-observability-without-pii.md)'s standing rule that a file-derived field ships only with a named consumer — billing is not a consumer of the location count today, and does not become one until this fires.

**Extends #12's runbook:** the check is a cross-reference, not a new metric — #12 already records the location label per `(location, workday)` partition against a `tenantId`, and `locationCount` now lives in Clerk. Add it to the daily manual pass; it needs no new instrumentation.

---

## 9. Deferred, with the reason

| Deferred | Why | What reopens it |
|---|---|---|
| Tier banding, volume discounts, freemium | [#04](../issues/04-decide-pricing-shape.md) | price elasticity data |
| Content-based location enforcement | §8 | §8's trigger |
| `event.created` ordering guard | §6's re-fetch makes ordering harmless | an observed interleaving that the re-fetch does not repair |
| `customer.subscription.trial_will_end` handler | Stripe's own reminder emails cover it | wanting our own trial-end copy |
| Multi-currency | no non-US customer | a non-US customer |
| Our own quantity-control UI | the portal has one | the portal proving inadequate in a real session |
| **US multi-state sales-tax registration & remittance** | separate workstream; dormant billing postpones it | **must be discharged before the first real charge** — see the map's fog |

Stripe Tax **calculates** but does not register or file. Choosing Stripe over a merchant-of-record made this ours ([#07](../issues/07-decide-infrastructure-stack.md)); the beta postpones it but does not remove it.

---

## 10. Verify-on-first-deploy checklist

1. `stripe.webhooks.constructEventAsync` works in the Worker isolate (§6).
2. `Stripe.createFetchHttpClient()` is selected, and whether `createSubtleCryptoProvider()` is also required (§6).
3. The exact Clerk session-claim shortcode prefix for org public metadata (§4).
4. A `publicMetadata` write via `@clerk/backend` appears in the session token within one refresh cycle (§5's ~60 s bound).
5. Checkout with a 100%-off-forever coupon and `payment_method_collection: 'if_required'` genuinely collects no card (§7.1).
