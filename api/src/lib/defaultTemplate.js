// Mirrors src/core/constants.js's DEFAULT_GROUPS/DEFAULT_HOURS_BY_DAY/DEFAULT_ADVANCED_SETTINGS.
// Duplicated rather than imported: api/ is deployed standalone (SWA only zips the
// apiLocation folder), so a relative import reaching outside api/ would work locally
// but not in production.

/** Seeded into a new Company's default template, and (per #5) copied into each new Location. */
export const DEFAULT_COVERAGE_GROUPS = [
    {
        id: 1,
        name: 'Bldg 2',
        departments: [
            { main: 'Frontline', sub: 'Customer Service Bldg 2' },
            { main: 'Hardgoods', sub: 'Action Sports' },
            { main: 'Hardgoods', sub: 'Rentals' }
        ]
    },
    {
        id: 2,
        name: 'Shop',
        departments: [
            { main: 'Shop', sub: 'Shop' },
            { main: 'Shop', sub: 'Service Advisor' },
            { main: 'Shop', sub: 'Assembler' }
        ]
    }
];

const DEFAULT_HOURS_BY_DAY = {
    monday: { start: '10:00', end: '21:00' },
    tuesday: { start: '10:00', end: '21:00' },
    wednesday: { start: '10:00', end: '21:00' },
    thursday: { start: '10:00', end: '21:00' },
    friday: { start: '10:00', end: '21:00' },
    saturday: { start: '10:00', end: '21:00' },
    sunday: { start: '10:00', end: '21:00' }
};

const DEFAULT_ADVANCED_SETTINGS = {
    maxEarly: 30,
    maxDelay: 60,
    deptCoverageMode: 'balanced',
    timeCoverageMode: 'balanced',
    idealMealOffset: 240
};

/** Every Location defaults to California until a second jurisdiction ruleset exists (#31 in issue #1). */
export const DEFAULT_JURISDICTION = 'california';

export const DEFAULT_SETTINGS = {
    jurisdiction: DEFAULT_JURISDICTION,
    hoursByDay: DEFAULT_HOURS_BY_DAY,
    advanced: DEFAULT_ADVANCED_SETTINGS
};
