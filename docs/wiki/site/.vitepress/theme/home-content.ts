/**
 * IGNIS's identity for the shared header and footer. The structure, the design and the behaviour are
 * the shared layout (theme/shared); this file only says what it shows.
 */
import pkg from '../../../../../packages/core-server/package.json';
import type { TSiteInfo } from './shared/home-types';

export const SITE: TSiteInfo = {
  id: 'ignis',
  name: 'IGNIS',
  repo: 'https://github.com/VENIZIA-AI/ignis',
  npm: 'https://www.npmjs.com/package/@venizia/ignis',
  own: [
    ['Guide', '/guides/'],
    ['References', '/references/'],
    ['Extensions', '/extensions/'],
    ['Changelog', '/changelogs/'],
  ],
};

export const VERSION: string = pkg.version;
