# CA Meal & Rest Compliance Audit — `src/core/` Break Scheduler

**Ticket:** Is the current `src/core/` algorithm a complete and correct implementation of California
meal-period and rest-break law for hourly **retail** (mercantile) workers? If not, what must v1 handle
vs. defer?

**Scope of code reviewed:** `src/core/EmployeeSchedule.js`, `src/core/BreakScheduler.js`,
`src/core/constants.js`, `src/core/optimizer.js`, plus `src/facades/ExcelFacade.js` (output layer) and
`README.md` (v2.1 DLSE overhaul).

**Bottom line:** The **rest-break count** and the **first-meal deadline** are implemented correctly.
But there are **three genuine correctness defects** that make the tool under-schedule for the exact
shifts that need the most protection (long shifts and split shifts), and **zero impossibility
detection**. This is *not* yet a complete, correct implementation. It is close for the common
5–10h continuous shift, and materially wrong above 10h and for gap-satisfied split shifts.

---

## 1. Primary sources (all legal claims below cite these)

- **CA Labor Code § 512(a)** — meal-period thresholds and waivers.
  <https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=LAB&sectionNum=512.>
  - First meal: *"An employer shall not employ an employee for a work period of **more than five hours**
    per day without providing … a meal period of not less than 30 minutes, except that if the total
    work period per day … is **no more than six hours**, the meal period may be waived by mutual
    consent."*
  - Second meal: *"… **more than 10 hours** per day without providing … a second meal period of not
    less than 30 minutes, except that if the total hours worked is **no more than 12 hours**, the
    second meal period may be waived by mutual consent … **only if the first meal period was not
    waived**."*
- **CA Labor Code § 226.7** — remedy for a missed meal/rest/recovery period is *"one additional hour
  of pay at the employee's regular rate of compensation for each workday that the meal or rest …
  period is not provided."* Premium is **per workday per category** (one hour for meals, one hour for
  rest), **not** per missed break.
  <https://law.justia.com/codes/california/code-lab/division-2/part-1/chapter-1/article-1/section-226-7-d-1/>
- **DLSE Meal Period FAQ** — timing deadlines: first meal *"no later than the end of the employee's
  **fifth hour of work**"*; second meal *"no later than the end of the employee's **tenth hour of
  work**."*
  <https://www.dir.ca.gov/dlse/faq_mealperiods.htm>
- **DLSE Rest Period FAQ** — *"a net ten consecutive minutes for each four hour work period, or major
  fraction thereof"*; DLSE treats *"anything over two hours a major fraction of four hours"*; no rest
  required under 3.5h; table: **3.5–6h = 1, over 6–10h = 2, over 10–14h = 3**; breaks *"in the middle
  of each work period"* insofar as practicable.
  <https://www.dir.ca.gov/dlse/faq_restperiods.htm>
- **IWC Wage Order 7-2001 (Mercantile Industry)** — the wage order that governs **retail** employers
  (sale of goods at retail). § 11 (meals) and § 12 (rest) mirror the statute/DLSE above; § 4(C) adds a
  **split-shift premium** (one hour at minimum wage). Confirmed Wage Order 7 = mercantile/retail.
  <https://www.dir.ca.gov/IWC/IWCArticle7.pdf> (see also
  <https://www.dir.ca.gov/iwc/wageorderindustries.htm>)

> Note: the Wage Order 7 § 11 meal text is the same 30-minute standard as § 512; a paraphrase seen
> during research ("one hour for shifts of more than five hours") is **incorrect** — the meal minimum
> is **30 minutes**, per § 512 and WO7 § 11(A). This audit relies on the statutory text.

---

## 2. What the code actually does (established by reading the source)

- **Meal count** (`EmployeeSchedule.mealsRequired`): `work >= 300 → 1`, `work >= 600 → 2` (minutes),
  minus 1 if a split gap is deemed to satisfy the first meal.
- **First-meal deadline** (`constants.MAX_WORK_BEFORE_MEAL = 285`; `BreakScheduler` STEP 1): the meal's
  *latest* start is `workedTimeToClockTime(min(285, netWork))`, and the optimizer's `maxDelay` is
  clamped so no candidate can exceed that latest. Preferred placement is `idealMealOffset = 240` (4h),
  i.e. the code targets 4h but **caps the deadline at 4h45m of worked time**.
- **Second meal** (STEP 1, `mealsNeeded >= 2`): computed with a latest of `2 × 285 = 570` worked min,
  stashed on `_secondMealTime`, later written into the **`rest3` slot** — *only if `rest3` is still
  `null`.*
- **Rest count** (`restBreaksRequired`): `total < 210 → 0`; else
  `floor(total/240) + (total%240 > 120 ? 1 : 0)`.
- **Rest placement** (`computeIdealRestClock`): midpoint of each 4h *worked* period, mapped through
  gaps/meals; optimizer may then shift it `-maxEarly(30) … +maxDelay(60)` for coverage staggering.
- **Break duration:** meals 30 min, rests **15 min** (legal minimum is a *net 10*; 15 is
  over-compliant and fine).
- **Split gap** (`gapSatisfiesMealPeriod`): if `isSplitShift` and `largestGap >= 30`, the gap is
  treated as the first meal. **The implementation checks only duration — not timing** (its own
  docstring claims it must "occur within the first 5 hours of work," but the code does not check that).
- **Output** (`ExcelFacade.writeBreaks` + `constants.COL`): writes only three columns —
  `REST1`, `MEAL`, `REST2`. **There is no `REST3` column and no code path that writes `rest3`.**

---

## 3. Rule-by-rule verdicts (gap table)

| # | Rule (legal requirement) | Legal source | Current behavior in `src/core/` | Verdict |
|---|---|---|---|---|
| 1 | First meal must **begin before the end of the 5th hour of work** (before 300 worked min) — a hard deadline, not a soft target | § 512(a); DLSE Meal FAQ | Latest start capped at `MAX_WORK_BEFORE_MEAL = 285` worked min and enforced via the optimizer's `maxDelay` clamp. 285 < 300 → conservative and legal. Preferred = 240 but window extends to 285. | **Implemented-correctly** (deadline *is* enforced, with a 15-min safety buffer). *Caveat:* the `findOptimalBreakTime` fallback path (`clampToSegment`) ignores the 285 cap when no valid candidate exists — see rule 8. |
| 2 | Second meal required for shifts **> 10 hours**, beginning before the end of the 10th hour | § 512(a); DLSE Meal FAQ | Count triggers at `>= 600` (>= 10h, not > 10h). Latest computed at 570 worked min (< 600) → timing is conservative. **But the placement is silently dropped** for effectively every >10h shift (see rule 9). | **Implemented-wrong** — the second meal is computed but not delivered for the shifts that require it. |
| 3 | First meal waivable if shift **≤ 6h**; second waivable if total **≤ 12h AND first not waived** | § 512(a) | No waiver concept exists. Tool always schedules the meal(s) it counts. | **Not-implemented** — safe to **defer** (always scheduling a meal is over-compliant, never a violation; waiver is the employee's option). |
| 4 | Rest: one paid 10-min per 4h **"or major fraction thereof"** (>2h); none under 3.5h | WO7 § 12; DLSE Rest FAQ | `floor(total/240) + (total%240 > 120 ? 1 : 0)`, `<210 → 0`. Verified against the Brinker/DLSE table: 3.5–6h=1, 6h=1, 6h1m=2, ≤10h=2, 10h1m=3, ≤14h=3. | **Implemented-correctly.** |
| 5 | Rest breaks placed **in the middle of each work period** insofar as practicable | WO7 § 12; DLSE Rest FAQ | Ideal = worked-time midpoint of each 4h period (gap/meal-aware). Optimizer may move `-30…+60` min for staggering. | **Implemented-correctly** (movement is within the "insofar as practicable" latitude; nrest/meal/rest ordering is preserved by slot naming). Low-risk. |
| 6 | Meal minimum **30 min**; rest minimum **net 10 min** | § 512; WO7 §§ 11–12 | Meal = 30, rest = 15. | **Implemented-correctly** (rest over-compliant at 15). |
| 7 | Premium pay: 1 hr regular rate per workday for a missed/late/short meal or rest; and detect when a **compliant schedule is impossible** | § 226.7; DLSE FAQs | No premium concept and **no impossibility detection at all.** | **Not-implemented.** Premium *computation* → defer (payroll). Impossibility *detection/flagging* → **must-handle** (see §4). |
| 8 | Never place a break outside a worked segment / in an unpaid gap; deadline must hold even in fallback | § 226.7 (a non-compliant break = missed break) | `isValidBreakWindow` correctly requires the break inside one segment. **But** when no valid candidate exists, `findOptimalBreakTime` falls back to `clampToSegment`, which ignores the 285 meal deadline and can place a meal late (or a break at a clamped, non-ideal spot) **with no warning**. | **Implemented-wrong / gap** — silent fallback can produce a late (non-compliant) meal. Must at least **flag**. |
| 9 | Deliver **all** required breaks in the output for long shifts (a >10h shift needs rest1, meal1, rest2, meal2, rest3 = 5 breaks) | § 512; WO7 § 12 | Data model has only 4 slots (`rest1, meal, rest2, rest3`) and the **output writes only 3 columns** (`REST1, MEAL, REST2`; no `REST3`). Worse, the 2nd meal is placed into `rest3` **only if `rest3 == null`**, but for any shift >10h the 3rd rest break already occupies `rest3` → the 2nd meal is dropped internally, and even the 3rd rest is never written to the file. | **Implemented-wrong (HIGH severity)** — for every shift over 10h the tool loses the 2nd meal and the 3rd rest break. |
| 10 | Split-shift gap can only substitute for a meal if it is duty-free **and** falls within the first-5-hour window | § 512(a) timing; DLSE Meal FAQ | `gapSatisfiesMealPeriod` checks `largestGap >= 30` **only** — no timing check, despite the docstring claiming a 5-hour check. A late gap (e.g. after a 6h first segment) wrongly cancels the required first meal. | **Implemented-wrong (MEDIUM–HIGH)** — can leave the first 5+ hours with no meal. |
| 11 | Boundary at exactly 5h / exactly 10h: law triggers on **> 5h** and **> 10h**; exactly 5h/10h needs no (second) meal | § 512(a) | Uses `>= 300` and `>= 600`. Schedules a meal at *exactly* 5h and a 2nd meal at *exactly* 10h. | **Implemented-wrong but over-compliant** — no legal risk; low priority. Defer or tidy. |
| 12 | Retail (Wage Order 7) nuances: split-shift premium (§4C), seating (§14), on-duty meal agreements (§11) | WO7 §§ 4, 11, 14 | None modeled. Split gaps treated as plain unpaid time (no premium flag). On-duty meals not modeled. | **Not-implemented** — all **defer** for v1 (these are pay/facility concerns, not break-placement math). Split-shift *premium* is payroll, not scheduling. |

---

## 4. Recommended v1 split — MUST-HANDLE vs. DEFER

### MUST-HANDLE for v1 (correctness / silent non-compliance)

1. **Fix the long-shift break-slot & output loss (rule 9).** A shift >10h legally needs 5 breaks
   (rest1, meal1, rest2, meal2, rest3). Today the 2nd meal and 3rd rest are silently dropped —
   the tool actively omits legally required breaks for the highest-risk shifts. Requires: a break
   model that holds ≥5 breaks and a `REST3`/`MEAL2` output column in `ExcelFacade`/`COL`.
   *Source: § 512(a) second meal; WO7 § 12 / DLSE Rest FAQ "over 10 to 14 hours = 3."*
2. **Fix split-gap meal substitution timing (rule 10).** Only let a split gap cancel the first meal
   when the gap begins before the end of the 5th hour of work (and is a genuine ≥30-min duty-free
   period). Otherwise schedule the first meal inside segment 1. *Source: § 512(a); DLSE Meal FAQ
   "end of the fifth hour of work."*
3. **Detect and FLAG impossibility (rules 7, 8).** When a compliant meal cannot be placed before the
   5th-hour deadline (segment too short, no valid window, fallback clamp fired), the tool must surface
   a **"schedule cannot be made compliant — premium pay likely owed"** warning per employee rather
   than silently emitting a late/clamped break. This is the single most important v1 safety feature
   for a compliance product. *Source: § 226.7 (a late/missed meal owes premium); DLSE Meal FAQ.*

### SHOULD-HANDLE if cheap (correctness, low blast radius)

4. **Boundary `>=` vs `>` at 5h/10h (rule 11).** Change count triggers to strictly `> 300` / `> 600`
   so exactly-5h and exactly-10h shifts aren't over-scheduled. Over-compliant today, so low urgency,
   but trivially correct to fix. *Source: § 512(a) "more than five/10 hours."*

### DEFER for v1 (not compliance-blocking)

5. **Meal waivers (rule 3).** Always-schedule is over-compliant; add opt-in waivers later.
6. **§ 226.7 premium-pay *computation* / payroll output (rule 7).** Detection (item 3) is enough for
   v1; dollar computation is a payroll concern.
7. **Split-shift premium, seating, on-duty meal agreements (rule 12).** Pay/facility rules outside
   break-placement math.
8. **Rest-break 15→10 min and mid-period tightening (rules 5, 6).** Already compliant; no action.

---

## 5. Most important correctness bugs (for the summary)

- **B1 (HIGH):** Any shift **> 10 hours** loses its **second meal period** and its **third rest
  break** — the 2nd meal is only placed if the `rest3` slot is free, but a >10h shift always fills
  `rest3` with the 3rd rest; and `ExcelFacade.writeBreaks` has **no `REST3` column** anyway, so both
  are absent from the output file. Violates § 512(a) (2nd meal) and WO7 § 12 (3rd rest).
- **B2 (MEDIUM–HIGH):** **Split-shift gap** is accepted as the first meal on **duration alone**
  (`>=30`), with no check that the gap falls within the first 5 hours — contradicting the method's own
  docstring. A shift like 6h + gap + 4h can end up with **no meal in the first 5+ hours**, violating
  the § 512(a) / DLSE "end of the fifth hour of work" deadline.
- **B3 (MEDIUM):** **No impossibility detection.** When no compliant window exists, the optimizer's
  `clampToSegment` fallback silently places a late/edge break with no warning, so an
  impossible-to-comply schedule looks clean — the worst failure mode for a compliance tool
  (§ 226.7 premium would be owed and nobody is told).

The parts the README's "v2.1 DLSE overhaul" claims — the **rest-break count formula** and the
**first-meal 4h45m deadline** — are, on inspection, **correct**. The gaps are concentrated in long
shifts, split shifts, and the absence of any "cannot comply" signal.
