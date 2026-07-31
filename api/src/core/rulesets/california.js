// Mirrors src/core/rulesets/california.js (project root) unchanged — duplicated because api/ is deployed standalone (see api/src/lib/defaultTemplate.js's note).
/**
 * California meal/rest-break ruleset (IWC Wage Orders, DLSE enforcement policy).
 *
 * Implements the `JurisdictionRuleset` interface: given the shapes derived from an
 * EmployeeSchedule (total worked minutes, whether a split-shift gap already satisfies
 * a meal period), returns how many meal/rest breaks are legally required, plus the
 * constants BreakScheduler needs to compute legal placement windows.
 */
export const california = {
    id: 'california',

    /** Meal/rest break durations, in minutes. */
    MEAL_DURATION: 30,
    REST_DURATION: 15,

    /**
     * Latest safe worked-time offset before a meal must start (4h45m). Scheduling the
     * meal here means the employee returns after 5h15m of shift time but only 4h45m of
     * worked time, leaving a compliance buffer before the 5h worked trigger.
     */
    MAX_WORK_BEFORE_MEAL: 285,

    /** Worked-minute thresholds at which meal periods become required. */
    MEAL_THRESHOLD_1: 300, // 5h
    MEAL_THRESHOLD_2: 600, // 10h

    /** Rest break thresholds: no break below 3.5h; one per 4h period or major fraction (> 2h). */
    REST_THRESHOLD: 210,
    REST_PERIOD: 240,
    REST_MAJOR_FRACTION: 120,

    /**
     * Determine how many meal periods are legally required.
     *
     * - >= 5 hours worked (300 min): 1 meal period
     * - >= 10 hours worked (600 min): 2 meal periods
     * - If a split-shift gap already satisfies the first meal period, reduce by 1
     *   (but a second meal is still required if total worked time crosses 10h).
     *
     * @param {number} totalWorkMinutes
     * @param {boolean} gapSatisfiesMeal - Whether the split-shift gap satisfies the first meal
     * @returns {number}
     */
    mealsRequired(totalWorkMinutes, gapSatisfiesMeal) {
        let required = 0;
        if (totalWorkMinutes >= this.MEAL_THRESHOLD_1) required = 1;
        if (totalWorkMinutes >= this.MEAL_THRESHOLD_2) required = 2;

        if (gapSatisfiesMeal && required >= 1) {
            required -= 1;
        }

        return required;
    },

    /**
     * Determine how many rest breaks are legally required.
     *
     * Strict CA DLSE formula: one paid 10-minute rest per 4-hour work period or
     * major fraction thereof. "Major fraction" = strictly more than 2 hours (120 min).
     * No break required if total scheduled time is less than 3.5 hours (210 min).
     *
     * @param {number} totalWorkMinutes
     * @returns {number}
     */
    restBreaksRequired(totalWorkMinutes) {
        if (totalWorkMinutes < this.REST_THRESHOLD) return 0;
        return Math.floor(totalWorkMinutes / this.REST_PERIOD)
            + (totalWorkMinutes % this.REST_PERIOD > this.REST_MAJOR_FRACTION ? 1 : 0);
    },

    /**
     * For a split shift, determine whether the split gap itself counts as the meal
     * period. The gap must be at least a full meal period's length.
     *
     * @param {{ duration: number }|null} largestGap
     * @returns {boolean}
     */
    gapSatisfiesMealPeriod(largestGap) {
        return largestGap !== null && largestGap.duration >= this.MEAL_DURATION;
    }
};
