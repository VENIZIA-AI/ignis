/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The docs sites of the three Venizia products, with their addresses: the "Docs" column of the home
 * footer lists them. They open in the same tab.
 */
export type TDocsSiteId = 'ignis' | 'ardor' | 'vulcan';

export type TDocsSite = {
  id: TDocsSiteId;
  name: string;
  href: string;
};

export const DOCS_SITES: TDocsSite[] = [
  { id: 'ignis', name: 'IGNIS', href: 'https://ignis.venizia.ai' },
  { id: 'ardor', name: 'ARDOR', href: 'https://ardor.venizia.ai' },
  { id: 'vulcan', name: 'VULCAN', href: 'https://vulcan.venizia.ai' },
];
