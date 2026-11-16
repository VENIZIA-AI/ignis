/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The items of every version folder, for the version page. Only that page imports it, as an async component, so the items
 * stay out of the main bundle.
 */
import { createItemsLoader } from './changelog-loader';
import type { TVersionItems } from './changelog-loader';

declare const data: TVersionItems[];

export { data };

export default createItemsLoader();
