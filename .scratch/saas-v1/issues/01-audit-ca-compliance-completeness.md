# Audit CA compliance completeness

Type: research
Status: resolved
Context: findings at `.scratch/saas-v1/research/01-ca-compliance-audit.md`

## Question

Is the current `src/core/` algorithm a *complete and correct* implementation of California meal-period and rest-break law for hourly retail workers — and if not, what is the definitive list of gaps v1 must handle vs. may defer?

The product sells **compliance**, so a subtle error manufactures legal liability behind a legal-looking veneer. This audit produces the authoritative requirements list that locks the algorithm's v1 scope.

Check the current implementation (`EmployeeSchedule.js`, `BreakScheduler.js`, `constants.js`) against authoritative primary sources (CA Labor Code §512, IWC Wage Orders — Wage Order 7 for retail, DLSE guidance) on at least:

- **Meal timing deadline:** first meal must *begin before the end of the 5th hour* (the README describes placing it "at the 4h mark" — verify the legal *deadline* is enforced, not just a target).
- **Second meal:** required for shifts >10h, must begin *before the end of the 10th hour*.
- **Meal waivers:** first meal waivable if shift ≤6h; second waivable if ≤12h *and* first not waived.
- **Rest break placement:** one paid 10-min per 4h "or major fraction," *in the middle of each work period insofar as practicable*.
- **Premium pay triggers:** 1 hour at regular rate for missed/late/short meal or rest — likely a *flag* ("this schedule can't be made compliant") rather than something scheduled; determine whether v1 should detect impossibility.
- Any retail-specific Wage Order 7 nuances.

Deliverable: a gap list (implemented correctly / implemented wrong / not implemented) with a recommended v1 must-handle vs. defer split, each item cited to a primary source.

## Answer

Full findings (with primary-source citations — Labor Code §512/§226.7, DLSE FAQs, IWC Wage Order 7): [`research/01-ca-compliance-audit.md`](../research/01-ca-compliance-audit.md).

**Verdict: close but not complete/correct.** Two README v2.1 claims verified correct: the rest-break count formula (vs. Brinker/DLSE table) and the first-meal deadline (285 worked min < 300-min "end of 5th hour", enforced via optimizer `maxDelay` clamp).

**Three real correctness bugs, all on the highest-risk long shifts:**
- **B1 (HIGH):** shifts >10h silently LOSE both the legally required second meal and the third rest break. The 2nd meal is only placed if the `rest3` slot is free, but a >10h shift always fills `rest3`; and `ExcelFacade.writeBreaks` has no `REST3` output column — so both vanish from the file.
- **B2 (MEDIUM-HIGH):** `gapSatisfiesMealPeriod()` accepts a split-shift gap as the first meal on duration alone (`>=30`) with no timing check, so a 6h+gap+4h shift can end up with no meal in the first 5+ hours (violates §512(a)).
- **B3 (MEDIUM):** zero impossibility detection — when no compliant window exists, `clampToSegment` silently emits a late/edge break (worst failure mode for a compliance tool).

**Recommended v1 must-handle** = exactly those three: (1) expand the break model + output columns to hold 5 breaks; (2) add the split-gap timing check; (3) flag "cannot be made compliant" per employee. **Defer:** meal waivers, §226.7 premium-pay dollar computation, split-shift premium.
