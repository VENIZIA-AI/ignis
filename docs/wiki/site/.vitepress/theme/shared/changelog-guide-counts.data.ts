/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * How many migration blocks each version has and which codemods run them: a few bytes per version, so the index and the
 * version page can link to the upgrade guide without loading it.
 */
import { createGuideCountsLoader } from './changelog-loader';
import type { TGuideCount } from './changelog-guides';

declare const data: TGuideCount[];

export { data };

export default createGuideCountsLoader();
