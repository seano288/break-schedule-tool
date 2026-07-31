# Decide pricing shape

Type: grilling
Status: open

## Question

What is the *shape* of v1 pricing — per-location, per-employee/seat, flat monthly, usage-metered (per schedule run), or tiered — not the dollar amount, but the billing model the signup flow and billing config must implement?

This gates the billing provider/config work: metered vs. seat-based vs. flat drives very different Stripe setups and very different signup UX. It also interacts with the buyer (a single-store manager vs. a multi-location ops director) and with value metric (is value proportional to locations, headcount, or runs?).

Resolve via `/grilling` + `/domain-modeling`: who the buyer is, what the value scales with, what's easy to meter given B1 (transient, per-run compute is naturally observable), and what competitors/adjacent tools charge on.

Deliverable: the chosen pricing shape + value metric, with rationale, recorded as the constraint the billing ticket builds to.
