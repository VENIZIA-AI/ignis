import { getError } from '@venizia/ignis-helpers';
import type { AnyType, TClass } from '@venizia/ignis-helpers';
import { dirname } from 'node:path';
import {
  ArtifactStereotypes,
  ArtifactTypes,
  type IScannedArtifact,
  type TGeneratedArtifactIndex,
} from '../generator/common';
import { ArtifactSources } from './sources';

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

    // A warm scan cache needs neither the plugin nor TypeScript: import the listed classes directly.
    const entry = ArtifactSources.entry();
    const packageSource = ArtifactSources.packageSource({
      from: entry ? dirname(entry) : process.cwd(),
    });
    if (ArtifactSources.isCached({ packageSource })) {
      const artifacts = ArtifactSources.scan({ packageSource });
      return AutoArtifactsLoader.importIndex({
        artifacts: entry ? ArtifactSources.runningArtifacts({ artifacts, from: entry }) : artifacts,
      });
    }

    // A non-static specifier: a bundler must not pull the scanner (and TypeScript) into a binary.
    const pluginModule = './plugin';
    const { IgnisArtifactsPlugin } = await import(pluginModule);
    await IgnisArtifactsPlugin.registerRuntime();

    // A static specifier on purpose: a build without IgnisArtifactsPlugin then fails to resolve it, instead of shipping a binary with no classes.
    const { GeneratedArtifacts } = await import('ignis:artifacts');
    return GeneratedArtifacts;
  }

  /** The index the emitter would render for `artifacts`: modules imported in path order, each field sorted by class name. */
  static async importIndex(opts: {
    artifacts: IScannedArtifact[];
  }): Promise<TGeneratedArtifactIndex> {
    const emitted = opts.artifacts
      .filter((artifact) => artifact.type !== ArtifactTypes.MODEL)
      .sort(
        (left, right) =>
          left.filePath.localeCompare(right.filePath) ||
          left.className.localeCompare(right.className),
      );

    const loaded = new Map<IScannedArtifact, TClass<AnyType>>();
    for (const artifact of emitted) {
      const module = await import(artifact.filePath);
      loaded.set(artifact, module[artifact.className]);
    }

    const index: Record<string, Array<TClass<AnyType>>> = {};
    for (const { type, field } of ArtifactStereotypes.EMIT_ORDER) {
      const classes = emitted
        .filter((artifact) => artifact.type === type)
        .sort((left, right) => left.className.localeCompare(right.className))
        .flatMap((artifact) => loaded.get(artifact) ?? []);
      if (classes.length > 0) {
        index[field] = classes;
      }
    }
    return index;
  }
}
