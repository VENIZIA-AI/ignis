import type { BunPlugin } from 'bun';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ArtifactIndexEmitter, ArtifactScanner } from '../generator';

/** Serves `ignis:artifacts` - the application's generated index, rendered in memory from the scanner. At run time it is a virtual module (`build.module`); in `Bun.build` it is resolved and loaded (`onResolve`/`onLoad`), so a binary carries the list and never scans. */
export class IgnisArtifactsPlugin {
  static readonly NAME = 'ignis-artifacts';
  static readonly VIRTUAL = 'ignis:artifacts';
  static readonly EXPORT_NAME = 'GeneratedArtifacts';

  /** `@venizia/ignis-boot/auto`, from source or from either dist format - replaced at build time by a static re-export of the virtual module. */
  static readonly AUTO_MODULE =
    /[\\/](?:ignis-boot|boot)[\\/](?:dist[\\/](?:esm|cjs)|src)[\\/]bun[\\/]auto\.(?:ts|js)$/;

  private static readonly RUNTIME_KEY = Symbol.for('@venizia/ignis-boot:artifacts-runtime-plugin');

  /** The `src` beside the nearest `package.json` at or above `from` (default: the working directory). */
  static defaultRoot(opts: { from?: string } = {}): string {
    let directory = resolve(opts.from ?? process.cwd());
    while (!existsSync(join(directory, 'package.json'))) {
      const parent = dirname(directory);
      if (parent === directory) {
        return join(resolve(opts.from ?? process.cwd()), 'src');
      }
      directory = parent;
    }
    return join(directory, 'src');
  }

  /** The index as module source: every import absolute, since a virtual module has no directory to resolve from. */
  static render(opts: { root: string }): string {
    const root = resolve(opts.root);
    const outFile = join(root, '__ignis_artifacts__.ts');
    const { artifacts } = ArtifactScanner.getInstance().scanWithReport({
      root,
      followReexports: true,
    });
    return ArtifactIndexEmitter.render({
      artifacts,
      outFile,
      exportName: IgnisArtifactsPlugin.EXPORT_NAME,
      command: { root, out: outFile },
      absoluteImports: true,
    });
  }

  /** For `Bun.build({ plugins: [IgnisArtifactsPlugin.create()] })`; `isRuntime` is set by `registerRuntime`, which serves a virtual module instead. */
  static create(opts: { root?: string; isRuntime?: boolean } = {}): BunPlugin {
    const root = opts.root ?? IgnisArtifactsPlugin.defaultRoot();
    const isRuntime = opts.isRuntime ?? false;
    const contents = (): string => IgnisArtifactsPlugin.render({ root });

    return {
      name: IgnisArtifactsPlugin.NAME,
      setup(build) {
        if (isRuntime) {
          build.module(IgnisArtifactsPlugin.VIRTUAL, () => ({
            contents: contents(),
            loader: 'ts',
          }));
          return;
        }

        const virtualPath = join(resolve(root), '__ignis_artifacts__.ts');
        build.onResolve({ filter: /^ignis:artifacts$/ }, () => ({ path: virtualPath }));
        build.onLoad({ filter: /__ignis_artifacts__\.ts$/ }, () => ({
          contents: contents(),
          loader: 'ts',
        }));
        build.onLoad({ filter: IgnisArtifactsPlugin.AUTO_MODULE }, () => ({
          contents: `import { ${IgnisArtifactsPlugin.EXPORT_NAME} } from '${IgnisArtifactsPlugin.VIRTUAL}';\nimport { AutoArtifactGroup } from './auto-group';\nexport default new AutoArtifactGroup({ content: ${IgnisArtifactsPlugin.EXPORT_NAME} });\n`,
          loader: 'ts',
        }));
      },
    };
  }

  /** Registers the run-time plugin once per process; a second call is a no-op. */
  static async registerRuntime(opts: { root?: string } = {}): Promise<void> {
    const registry = globalThis as Record<symbol, boolean | undefined>;
    if (registry[IgnisArtifactsPlugin.RUNTIME_KEY]) {
      return;
    }
    await Bun.plugin(IgnisArtifactsPlugin.create({ ...opts, isRuntime: true }));
    registry[IgnisArtifactsPlugin.RUNTIME_KEY] = true;
  }
}
