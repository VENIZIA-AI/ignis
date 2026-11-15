/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The versions that have a Breaking section, as build-time data: `import { data } from './changelog-breaking.data'`.
 */
import { createBreakingLoader } from './changelog-loader';

declare const data: string[];

export { data };

export default createBreakingLoader();
