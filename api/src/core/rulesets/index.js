// Mirrors src/core/rulesets/index.js (project root) unchanged — duplicated because api/ is deployed standalone (see api/src/lib/defaultTemplate.js's note).
import { california } from './california.js';

/**
 * Jurisdiction ruleset registry, keyed by ruleset id. Every Location currently
 * defaults to `california` — no other jurisdiction is implemented yet.
 */
export const RULESETS = {
    california
};

export const DEFAULT_RULESET = california;

/**
 * Look up a jurisdiction ruleset by id, falling back to the default when the id
 * is missing or unrecognized.
 *
 * @param {string} [jurisdiction]
 * @returns {typeof california}
 */
export function getRuleset(jurisdiction) {
    return RULESETS[jurisdiction] || DEFAULT_RULESET;
}

export { california };
