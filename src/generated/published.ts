/**
 * When the catalogue was last published. **Generated — do not edit by hand.**
 *
 * Written by `npm run render:site` on every build, and committed, for two reasons.
 * The footer states it on every page, which answers the question a contributor asks
 * first — "I sent a correction, why is it not here?" — before they have to ask it.
 * And the dynamic tier needs the same value as the static tier: baking it into the
 * Functions bundle at build time costs nothing at request time, where reading it
 * from D1 would be an extra query on every page view of 59,010 dogs.
 *
 * Committed rather than git-ignored so a fresh clone typechecks, and so the history
 * carries a record of when each publish actually happened.
 */
export const PUBLISHED_AT = '2026-09-02';
