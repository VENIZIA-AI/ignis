import { resolve } from 'node:path';
import { ArtifactScanner } from '../generator';
import { IgnisArtifactsPlugin } from '../bun/plugin';
import { ArtifactSources } from '../bun/sources';

/** The slice of Vite's plugin contract this plugin uses - typed here so `@venizia/ignis-boot` does not depend on `vite`. */
export interface IIgnisVitePlugin {
  name: string;
  enforce: 'pre';
  config: () => {
    optimizeDeps: { exclude: string[] };
    build: { rolldownOptions: { output: { keepNames: boolean } } };
  };
  configResolved: (config: { root: string }) => void;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
  transform: (code: string, id: string) => string | undefined;
  watchChange: (id: string) => void;
}

/** `IgnisArtifactsPlugin` for Vite: serves `ignis:artifacts`, replaces `@venizia/ignis-boot/auto` with an eager import of it (a browser bundle is tree-shaken only when eager), and inlines every `ArtifactGroup.define` / `application` call. Names are kept in the build, because binding keys are built from `Class.name` and a minifier renames classes. */
export class IgnisArtifactsVitePlugin {
  static readonly RESOLVED_VIRTUAL = `\0${IgnisArtifactsPlugin.VIRTUAL}`;

  static {
    ArtifactSources.useScanner({ scanner: ArtifactScanner.getInstance() });
  }

  /** `root`: the `src` to scan (default: the one beside the `package.json` of Vite's root). */
  static create(opts: { root?: string } = {}): IIgnisVitePlugin {
    let root = opts.root ? resolve(opts.root) : '';
    let groupFiles = new Set<string>();
    const autoModule = `import { ${IgnisArtifactsPlugin.EXPORT_NAME} } from '${IgnisArtifactsPlugin.VIRTUAL}';\nimport { AutoArtifactGroup } from './auto-group';\nexport default new AutoArtifactGroup({ content: ${IgnisArtifactsPlugin.EXPORT_NAME} });\n`;

    return {
      name: IgnisArtifactsPlugin.NAME,
      enforce: 'pre',
      // Pre-bundling would hide `auto` inside a dependency chunk, out of reach of `load`.
      config: () => ({
        optimizeDeps: { exclude: ['@venizia/ignis-boot'] },
        build: { rolldownOptions: { output: { keepNames: true } } },
      }),
      configResolved: config => {
        root ||= ArtifactSources.packageSource({ from: config.root });
        groupFiles = new Set(IgnisArtifactsPlugin.groupDefinitionFiles({ root }));
      },
      resolveId: id =>
        id === IgnisArtifactsPlugin.VIRTUAL ? IgnisArtifactsVitePlugin.RESOLVED_VIRTUAL : undefined,
      load: id => {
        if (id === IgnisArtifactsVitePlugin.RESOLVED_VIRTUAL) {
          return IgnisArtifactsPlugin.render({ root });
        }
        return IgnisArtifactsPlugin.AUTO_MODULE.test(id) ? autoModule : undefined;
      },
      transform: (code, id) =>
        groupFiles.has(id)
          ? IgnisArtifactsPlugin.rewriteGroups({ filePath: id, source: code })
          : undefined,
      // A file added, removed or edited under the root can change the index: rescan on the next load.
      watchChange: id => {
        if (id.startsWith(root)) {
          ArtifactSources.clear();
        }
      },
    };
  }
}
