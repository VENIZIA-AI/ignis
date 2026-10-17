import { getError } from '@venizia/ignis-helpers';
import type { TGeneratedArtifactIndex } from '../generator';

/** Loads the application's index for `@venizia/ignis-boot/auto` from source: registers the run-time plugin, then imports the virtual module. A binary never runs this - the build replaces the module. */
export class AutoArtifactsLoader {
  static assertRuntime(opts: { hasBun: boolean }): void {
    if (!opts.hasBun) {
      throw getError({
        message:
          '[@venizia/ignis-boot/auto] Auto artifacts need Bun (a Bun plugin builds the index) | On Node, generate the index with `ignis-artifacts generate --root src --out src/_artifacts.ts` and pass it to configs.artifacts',
      });
    }
  }

  static async load(): Promise<TGeneratedArtifactIndex> {
    AutoArtifactsLoader.assertRuntime({ hasBun: typeof Bun !== 'undefined' });

    // Non-static specifiers: a bundler must not pull the scanner (and TypeScript) into a binary.
    const pluginModule = './plugin';
    const { IgnisArtifactsPlugin } = await import(pluginModule);
    await IgnisArtifactsPlugin.registerRuntime();

    const virtualModule: string = IgnisArtifactsPlugin.VIRTUAL;
    const loaded = await import(virtualModule);
    return loaded[IgnisArtifactsPlugin.EXPORT_NAME];
  }
}
