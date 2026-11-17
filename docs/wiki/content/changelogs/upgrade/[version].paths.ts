import { fileURLToPath } from 'node:url';
import { guidePaths } from '../../../site/.vitepress/theme/shared/changelog-guides';

// One upgrade page per version folder that has a migration block; the blocks are the params of the page.
export default {
  watch: ['../*/migration.yaml'],
  paths: () => guidePaths({ directory: fileURLToPath(new URL('..', import.meta.url)) }),
};
