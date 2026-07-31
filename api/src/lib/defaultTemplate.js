import { DEFAULT_GROUPS, DEFAULT_HOURS_BY_DAY, DEFAULT_ADVANCED_SETTINGS } from '../core/constants.js';

/** Seeded into a new Company's default template, and (per #5) copied into each new Location. */
export const DEFAULT_COVERAGE_GROUPS = DEFAULT_GROUPS;

/** Every Location defaults to California until a second jurisdiction ruleset exists (#31 in issue #1). */
export const DEFAULT_JURISDICTION = 'california';

export const DEFAULT_SETTINGS = {
    jurisdiction: DEFAULT_JURISDICTION,
    hoursByDay: DEFAULT_HOURS_BY_DAY,
    advanced: DEFAULT_ADVANCED_SETTINGS
};
