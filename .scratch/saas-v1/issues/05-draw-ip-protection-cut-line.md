# Draw the IP-protection cut-line

Type: grilling
Status: open

## Question

Exactly where does the client/server boundary fall so the algorithm IP is protected — what runs server-side, what stays in the client, and does any part of the algorithm leak through the API's inputs/outputs?

IP protection is *the* reason for the server-side (B1) architecture, so the cut-line must be deliberate, not incidental. Resolve:

- Which `src/core/` modules move server-side (the scheduling math) vs. which client-side concerns remain (parsing/column-mapping UI, rendering the result, xlsx read/write).
- Does parsing happen client-side (only the normalized canonical model is POSTed — keeps raw file off the server, supports the transient-data story) or server-side? Trade-off: client-side parsing leaks the *canonical model shape* but not the algorithm; it also strengthens "we barely touch your data."
- Residual leakage: can the algorithm be reverse-engineered from enough input→output pairs? Is any rate-limiting / abuse consideration needed to protect against bulk extraction?
- What exactly gets deleted from the client bundle that ships today.

Deliverable: a precise boundary spec (client responsibilities | API contract | server responsibilities) that the canonical-model and infrastructure tickets build against.
