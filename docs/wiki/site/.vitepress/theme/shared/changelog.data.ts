/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The changelog entries as build-time data: `import { data } from './changelog.data'`.
 */
import { createEntriesLoader } from './changelog-loader';
import type { TChangelogEntry } from './changelog-entries';

declare const data: TChangelogEntry[];

export { data };

export default createEntriesLoader();
