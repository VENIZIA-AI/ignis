/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The newest prerelease of each version line as build-time data: `import { data } from './changelog-prereleases.data'`.
 */
import { fileURLToPath } from 'node:url';
import { PrereleaseTags } from './changelog-prereleases';
import type { IPrereleases } from './changelog-prereleases';

declare const data: IPrereleases;

export { data };

export default {
  load: (): IPrereleases =>
    PrereleaseTags.read({ from: fileURLToPath(new URL('.', import.meta.url)) }),
};
