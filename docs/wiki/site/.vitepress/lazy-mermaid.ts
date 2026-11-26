import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const ID = '\0lazy-mermaid';
const LOADER = '\0lazy-mermaid-loader';

/**
 * `vitepress-plugin-mermaid` imports mermaid statically from its component, so every page downloads
 * it. This answers that import with a module that loads mermaid when the first diagram renders.
 */
export const lazyMermaid = (): Plugin => {
  let target: string | undefined;

  return {
    name: 'lazy-mermaid',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === LOADER) {
        return LOADER;
      }

      if (
        source !== './mermaid' ||
        !importer?.includes('vitepress-plugin-mermaid/dist/Mermaid.vue')
      ) {
        return;
      }

      target = join(dirname(importer), 'mermaid.ts');

      return ID;
    },
    load(id) {
      // Two hops: VitePress preloads what the app chunk imports dynamically, on every page. It
      // preloads the small loader, not what the loader imports.
      if (id === LOADER) {
        return `export default () => import(${JSON.stringify(target)});`;
      }

      if (id !== ID) {
        return;
      }

      return `const load = async () => (await import(${JSON.stringify(LOADER)})).default();
export const init = async (...args) => (await load()).init(...args);
export const render = async (...args) => (await load()).render(...args);`;
    },
    buildEnd() {
      // A new plugin release that imports mermaid another way would silently load it on every page.
      if (this.meta.watchMode === false && !target) {
        this.error(
          'lazy-mermaid: the import it replaces was not found in vitepress-plugin-mermaid',
        );
      }
    },
  };
};
