/**
 * Golden break placements captured from the pre-refactor implementation (hardcoded
 * California formulas inline in EmployeeSchedule/BreakScheduler, commit 64e6860),
 * across the existing fixture scenarios in `scheduleData.js`.
 *
 * Used by `tests/core/californiaRuleset.test.js` to assert the `california` ruleset
 * extraction (issue #3) is byte-identical to the pre-refactor behavior.
 */
export const PRE_REFACTOR_BREAKS = {
    BASIC_SCHEDULE: {
        'Alice Smith': { rest1: 600, meal: 750, rest2: 870, rest3: null },
        'Bob Jones':   { rest1: 660, meal: 810, rest2: null, rest3: null },
        'Carol Davis': { rest1: 840, meal: 960, rest2: null, rest3: null },
        'Dave Wilson': { rest1: 720, meal: null, rest2: null, rest3: null },
        'Eve Brown':   { rest1: 540, meal: 690, rest2: 810, rest3: null }
    },
    BASIC_SCHEDULE_GROUPS: {
        'Alice Smith': { rest1: 600, meal: 750, rest2: 870, rest3: null },
        'Bob Jones':   { rest1: 660, meal: 810, rest2: null, rest3: null },
        'Carol Davis': { rest1: 840, meal: 960, rest2: null, rest3: null },
        'Dave Wilson': { rest1: 720, meal: null, rest2: null, rest3: null },
        'Eve Brown':   { rest1: 540, meal: 690, rest2: 810, rest3: null }
    },
    SPLIT_SHIFT_SCHEDULE: {
        'Frank Green': { rest1: 540, meal: null, rest2: 1020, rest3: null },
        'Grace Lee':   { rest1: 600, meal: 750, rest2: 900, rest3: null }
    },
    LONG_SHIFT_SCHEDULE: {
        'Henry Clark': { rest1: 480, meal: 630, rest2: 735, rest3: 975 },
        'Iris Martin': { rest1: 600, meal: 750, rest2: 870, rest3: null }
    },
    SHORT_SHIFT_SCHEDULE: {
        'Jack Adams': { rest1: null, meal: null, rest2: null, rest3: null },
        'Kim Baker':  { rest1: 660, meal: null, rest2: null, rest3: null },
        'Leo Castro': { rest1: 675, meal: 810, rest2: 930, rest3: null }
    },
    MEAL_GAP_SCHEDULE: {
        'Meal Gap Employee': { rest1: 720, meal: null, rest2: 990, rest3: null }
    },
    SHORT_FIRST_SPLIT_SCHEDULE: {
        'Short First Employee': { rest1: 900, meal: null, rest2: null, rest3: null }
    }
};
