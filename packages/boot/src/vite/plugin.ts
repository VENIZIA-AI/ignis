import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { ArtifactScanner } from '../generator';
import { IgnisArtifactsPlugin } from '../bun/plugin';
import { ArtifactSources } from '../bun/sources';

/** The slice of Vite's plugin contract this plugin uses - typed here so `@venizia/ignis-boot` does not depend on `vite`. */
export interface IIgnisVitePlugin {
  name: string;
  enforce: 'pre';
  config: () => { optimizeDeps: { exclude: string[] } };
  configResolved: (config: { root: string }) => void;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
  transform: (code: string, id: string) => string | undefined;
}

/** `IgnisArtifactsPlugin` for Vite: serves `ignis:artifacts`, replaces `@venizia/ignis-boot/auto` with an eager import of it (a browser bundle is tree-shaken only when eager), inlines every `ArtifactGroup.define` / `application` call, and pins the name of every scanned class - binding keys are built from `Class.name`, and a minifier renames classes. */
export class IgnisArtifactsVitePlugin {
  static readonly RESOLVED_VIRTUAL = `\0${IgnisArtifactsPlugin.VIRTUAL}`;

  static {
    ArtifactSources.useScanner({ scanner: ArtifactScanner.getInstance() });
  }

  /** Opens each named class with `static { Object.defineProperty(this, 'name', ...) }`: a string literal survives minification, and a static block runs before the class's decorators read the name. Only these classes keep their names; the rest of the bundle minifies as usual. */
  static pinClassNames(opts: {
    filePath: string;
    source: string;
    classNames: ReadonlySet<string>;
  }): string {
    const sourceFile = ts.createSourceFile(
      opts.filePath,
      opts.source,
      ts.ScriptTarget.Latest,
      true,
    );
    const positions: Array<{ at: number; name: string }> = [];
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name && opts.classNames.has(node.name.text)) {
        positions.push({ at: node.members.pos, name: node.name.text });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    let pinned = opts.source;
    for (const { at, name } of positions.sort((left, right) => right.at - left.at)) {
      const block = ` static { Object.defineProperty(this, 'name', { value: ${JSON.stringify(name)} }); }`;
      pinned = pinned.slice(0, at) + block + pinned.slice(at);
    }
    return pinned;
  }

  /** `root`: the `src` to scan (default: the one beside the `package.json` of Vite's root). */
  static create(opts: { root?: string } = {}): IIgnisVitePlugin {
    let root = opts.root ? resolve(opts.root) : '';
    let groupFiles = new Set<string>();
    let classesByFile = new Map<string, Set<string>>();
    // The app's own src, and the src of every package that defines a group the app can borrow from: a borrowed class is bundled from there, and it needs its name pinned too.
    const scan = (): void => {
      classesByFile = new Map();
      const sources = new Set([
        root,
        ...[...groupFiles].map(file => ArtifactSources.packageSource({ from: dirname(file) })),
      ]);
      for (const packageSource of sources) {
        if (!existsSync(packageSource)) {
          continue;
        }
        for (const { filePath, className } of ArtifactSources.scan({ packageSource })) {
          classesByFile.set(filePath, (classesByFile.get(filePath) ?? new Set()).add(className));
        }
      }
    };
    const autoModule = `import { ${IgnisArtifactsPlugin.EXPORT_NAME} } from '${IgnisArtifactsPlugin.VIRTUAL}';\nimport { AutoArtifactGroup } from './auto-group';\nexport default new AutoArtifactGroup({ content: ${IgnisArtifactsPlugin.EXPORT_NAME} });\n`;

    return {
      name: IgnisArtifactsPlugin.NAME,
      enforce: 'pre',
      // Pre-bundling would hide `auto` inside a dependency chunk, out of reach of `load`.
      config: () => ({ optimizeDeps: { exclude: ['@venizia/ignis-boot'] } }),
      configResolved: config => {
        root ||= ArtifactSources.packageSource({ from: config.root });
        groupFiles = new Set(IgnisArtifactsPlugin.groupDefinitionFiles({ root }));
        scan();
      },
      resolveId: id =>
        id === IgnisArtifactsPlugin.VIRTUAL ? IgnisArtifactsVitePlugin.RESOLVED_VIRTUAL : undefined,
      load: id => {
        if (id === IgnisArtifactsVitePlugin.RESOLVED_VIRTUAL) {
          return IgnisArtifactsPlugin.render({ root });
        }
        return IgnisArtifactsPlugin.AUTO_MODULE.test(id) ? autoModule : undefined;
      },
      transform: (code, id) => {
        const classNames = classesByFile.get(id);
        if (!groupFiles.has(id) && !classNames) {
          return undefined;
        }
        const grouped = groupFiles.has(id)
          ? IgnisArtifactsPlugin.rewriteGroups({ filePath: id, source: code })
          : code;
        return classNames
          ? IgnisArtifactsVitePlugin.pinClassNames({ filePath: id, source: grouped, classNames })
          : grouped;
      },
    };
  }
}
