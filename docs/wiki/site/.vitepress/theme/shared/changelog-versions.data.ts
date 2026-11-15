/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The version folders as build-time data: `import { data } from './changelog-versions.data'`.
 */
import { createVersionsLoader } from './changelog-loader';
import type { TVersionEntry } from './changelog-entries';

declare const data: TVersionEntry[];

export { data };

export default createVersionsLoader();
