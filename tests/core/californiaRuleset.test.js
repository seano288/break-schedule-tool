import { describe, it, expect } from 'vitest';
import { scheduleBreaks } from '../../src/core/BreakScheduler.js';
import { EmployeeSchedule } from '../../src/core/EmployeeSchedule.js';
import { california, getRuleset, DEFAULT_RULESET } from '../../src/core/rulesets/index.js';
import {
    BASIC_SCHEDULE,
    SPLIT_SHIFT_SCHEDULE,
    LONG_SHIFT_SCHEDULE,
    SHORT_SHIFT_SCHEDULE,
    MEAL_GAP_SCHEDULE,
    SHORT_FIRST_SPLIT_SCHEDULE,
    TEST_GROUPS,
    TEST_ADV_SETTINGS,
    TEST_OPERATING_HOURS
} from '../fixtures/scheduleData.js';
import { PRE_REFACTOR_BREAKS } from '../fixtures/preRefactorBreaks.js';

const OPTIONS = {
    operatingHours: TEST_OPERATING_HOURS,
    groups: [],
    advancedSettings: TEST_ADV_SETTINGS,
    enableLogging: false,
    dataStart: 7,
    shiftColumnIndex: 3
};
const OPTIONS_WITH_GROUPS = { ...OPTIONS, groups: TEST_GROUPS };

const SCENARIOS = {
    BASIC_SCHEDULE: [BASIC_SCHEDULE, OPTIONS],
    BASIC_SCHEDULE_GROUPS: [BASIC_SCHEDULE, OPTIONS_WITH_GROUPS],
    SPLIT_SHIFT_SCHEDULE: [SPLIT_SHIFT_SCHEDULE, OPTIONS],
    LONG_SHIFT_SCHEDULE: [LONG_SHIFT_SCHEDULE, OPTIONS],
    SHORT_SHIFT_SCHEDULE: [SHORT_SHIFT_SCHEDULE, OPTIONS],
    MEAL_GAP_SCHEDULE: [MEAL_GAP_SCHEDULE, OPTIONS],
    SHORT_FIRST_SPLIT_SCHEDULE: [SHORT_FIRST_SPLIT_SCHEDULE, OPTIONS]
};

describe('california ruleset — wiring', () => {
    it('is the default ruleset for every Location', () => {
        expect(DEFAULT_RULESET).toBe(california);
    });

    it('getRuleset falls back to california for an unknown/missing jurisdiction', () => {
        expect(getRuleset('nevada')).toBe(california);
        expect(getRuleset(undefined)).toBe(california);
    });

    it('a plain EmployeeSchedule defaults to the california ruleset', () => {
        const emp = new EmployeeSchedule('Alice Smith');
        expect(emp.ruleset).toBe(california);
    });
});

describe('california ruleset — byte-identical regression vs pre-refactor implementation', () => {
    for (const [name, [data, opts]] of Object.entries(SCENARIOS)) {
        it(`${name}: break placements match the pre-refactor hardcoded formulas`, () => {
            const { breaks } = scheduleBreaks(data, opts);
            expect(breaks).toEqual(PRE_REFACTOR_BREAKS[name]);
        });
    }
});
