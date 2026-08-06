# Decide the fallback for exports lacking an employee-id column

Type: grilling
Status: open

> **Raised by [#08](08-confirm-ukg-employee-id-column.md).** [#06](06-design-canonical-model-and-parser-interface.md) decision 2 made `employeeId` required and rejects any file without one. #08 confirmed the column is **admin-configurable only** — and that **our own anchor customer's export has no id column today**. So the invariant currently rejects 100% of the one real file we have. #08 explicitly does *not* reopen decision 2; this ticket decides what happens to the customer standing on the wrong side of it.

## Question

What does v1 do when a customer's export has no employee-id column — hard-reject and make the admin report re-design a hard prerequisite, or ship a fallback identity strategy?

## Why it is not just "reopen #06"

#06's hazard is real and unchanged: name-keyed identity merges two same-named employees into one person with a gap, which reads as a split shift, which lets `gapSatisfiesMealPeriod()` **cancel a legally required meal**. The question is not whether that hazard exists but whether **hard rejection is the right response to it**, given the cost is now known to be an admin report re-design with lead time (possibly a UKG Salesforce SR) rather than a checkbox.

Note the asymmetry #08 exposed: **the shipped free tool is already exposed to this exact failure** (it keys identity on `formatName(row[2])`). Hard rejection is therefore strictly safer than the status quo, not a regression — but it converts a working user into a blocked one.

## To resolve

- **First, a fact only the design partner has:** is the anchor tenant's custom report **customer-editable at all**, or was it delivered by UKG Professional Services? #08 lists this as unconfirmable from public pages and says to ask. This changes the fallback from a bridge into a permanent route.
- **The three candidate routes.** (a) Hard-reject, prerequisite owned in onboarding. (b) Name-keying + **hard collision detection** — overlapping segments under one name are physically impossible, so they are a free, reliable signal; the open question is what the *non*-overlapping same-name case does (that is precisely the fabricated-split-shift case, and it is undetectable). (c) The **Dataview escape hatch** — needs no admin, manager-selectable *Employee ID*, but #08 could not confirm a Dataview emits **one row per shift segment with start/end times**; documented granularity is aggregate. Validating (c) needs a real sample file.
- **If a fallback ships, is it degraded-mode or equal-mode?** Does a name-keyed run carry a standing warning / a per-employee exception, and does it reuse the [#06](06-design-canonical-model-and-parser-interface.md) exception channel or need a new document-level channel?
- **Email as a third identity strategy** — #08 found Deputy's shift-grain interchange format matches on email with no id at all. Is `employeeId` really "the id column", or is it "any stable key the parser can name"?
- **The blank-cell rule**, which #08 asks to record as deliberate: a **present** id column with an **empty cell** is `SOURCE_ROW_UNPARSEABLE`, not a valid empty key. Vendors often ship the id as optional/employer-populated, so present-but-blank is the common case, not the rare one.

## Answers that change the route

- **Hard-reject** → onboarding grows a hard, sales-time prerequisite; the anchor customer cannot use v1 until their admin acts; rejection copy must name report, field, and role.
- **Fallback ships** → #06's model gains an identity-provenance notion (was the key an id, or a name?), and the exception channel likely grows a document-level tier.
