/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The Venizia ecosystem the header's switcher lists: the company and the three products, each with
 * its address and a line on what it is. The three docs sites open in the same tab, venizia.ai in a new one.
 */
export type TEcosystemId = 'venizia' | 'ignis' | 'ardor' | 'vulcan';

export type TEcosystemItem = {
  id: TEcosystemId;
  name: string;
  role: string;
  href: string;
  /** Opens in a new tab (the company site; the docs sites open in place). */
  external: boolean;
};

export const ECOSYSTEM: TEcosystemItem[] = [
  {
    id: 'venizia',
    name: 'Venizia',
    role: 'The company and its platform',
    href: 'https://venizia.ai',
    external: true,
  },
  {
    id: 'ignis',
    name: 'IGNIS',
    role: 'A TypeScript server framework on Hono',
    href: 'https://ignis.venizia.ai',
    external: false,
  },
  {
    id: 'ardor',
    name: 'ARDOR',
    role: 'Admin apps on an IGNIS container',
    href: 'https://ardor.venizia.ai',
    external: false,
  },
  {
    id: 'vulcan',
    name: 'VULCAN',
    role: 'The rules and workflow centre for coding agents',
    href: 'https://vulcan.venizia.ai',
    external: false,
  },
];
