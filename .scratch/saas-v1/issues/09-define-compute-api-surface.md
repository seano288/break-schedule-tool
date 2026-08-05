# Define the compute API surface

Type: grilling
Status: open

> **Raised by [#07 infrastructure stack](07-decide-infrastructure-stack.md).** Settling request granularity at **one request per location-week** collided with [#05](05-draw-ip-protection-cut-line.md)'s thin client, exposing a gap neither #05 nor [#06](06-design-canonical-model-and-parser-interface.md) specified.

## Question

What is the exact HTTP surface of the compute service — endpoints, request/response shapes, and error contract?

**The collision that forces this.** #05 fixed that the client uploads the **raw file** and ships **no parser** and **no `core/`**. #07 fixed that one compute request covers **one location-week**. Together those are incomplete: the client is asked to issue one request per location, but — having no parser — it **cannot know which locations the file contains**. Something must tell it, without putting the canonical model on the wire (#05 forbids that; the model is a server-*internal* seam).

The implied shape is two endpoints, and this ticket confirms or replaces it:

- `POST /inspect` → the location list + preset match-or-loud-rejection. Location *labels* are not rule logic, so returning them does not breach the cut-line — **but this needs an explicit ruling**, since it is the one place server-derived data crosses to the client.
- `POST /schedule?location=…` → the styled xlsx for that location-week (per #05's **R-server** decision).

## To resolve

- **Confirm the two-endpoint shape**, or find a better one. Is `/inspect` a cut-line breach or not? What is the *minimum* it can return?
- **Re-upload vs. re-parse.** The naive reading has the client re-sending the same file on every `/schedule` call (N+1 uploads of a small file, re-parsed each time). Cheap at tens of KB, but wasteful and it grows with location count. Is there a B1-safe alternative that does **not** persist employee data between requests?
- **Partial failure.** N requests means some can fail. What does the client show when 8 of 10 locations succeed? Does the user get 8 workbooks, or nothing?
- **Where the #06 exception channel surfaces.** `CANNOT_COMPLY`, `OVERNIGHT_UNSUPPORTED`, `SOURCE_ROW_UNPARSEABLE` are per-employee-day; they must reach the client per location. Are they in the xlsx, a sidecar JSON, or both?
- **Auth + trial gating** on each endpoint (Clerk session per #07), and where the size ceiling from [#10](10-set-per-request-size-ceiling.md) is enforced.

## Why it matters

This is the contract the greenfield frontend is written against, so it blocks the **Frontend architecture** work. It is also the last place the IP cut-line can leak by accident — #05 spent a whole ticket deciding the client duplicates zero rule logic, and an over-generous `/inspect` response would quietly undo that.
