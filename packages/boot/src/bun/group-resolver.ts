import { getError } from '@venizia/ignis-helpers';
import type { AnyType, TClass } from '@venizia/ignis-helpers';
import { ArtifactStereotypes, type TGeneratedArtifactIndex } from '../generator/common';
import { dirname } from 'node:path';
import { ArtifactSources } from './sources';

/** Fills an `ArtifactGroup` defined without content, from source: the defining package is the nearest `package.json` above the group's call site, and the group is every decorated class under a directory named `folder` in its `src`. */
export class GroupArtifactsResolver {
  /** The kernel's `SingletonRealm` slot for the group resolver (`ArtifactGroup.SINGLETON_REALM_KEY`). */
  static readonly REALM_SLOT = Symbol.for('@venizia/ignis-kernel:artifact-group-resolver');

  static async resolve(opts: {
    group: {
      folder: string | undefined;
      site: string | undefined;
      ignore?: ReadonlyArray<string>;
    };
  }): Promise<TGeneratedArtifactIndex> {
    const { folder, site, ignore } = opts.group;
    if (!site) {
      throw getError({
        message: `[ArtifactGroup] '${folder ?? '<application>'}' has no call site to resolve from | Define it with ArtifactGroup.define in the shared package's own source`,
      });
    }

    if (
      !ArtifactSources.isCached({
        packageSource: ArtifactSources.packageSource({ from: dirname(site) }),
      })
    ) {
      await ArtifactSources.loadScanner();
    }

    const index: Record<string, Array<TClass<AnyType>>> = {};
    for (const artifact of ArtifactSources.folderArtifacts({ folder, site, ignore })) {
      const field = ArtifactStereotypes.EMIT_ORDER.find(
        entry => entry.type === artifact.type,
      )?.field;
      if (!field) {
        continue;
      }
      const loaded = await import(artifact.filePath);
      index[field] = [...(index[field] ?? []), loaded[artifact.className]];
    }
    return index;
  }

  /** Fills the kernel's realm slot; the holder may already exist (the kernel created it empty), so it is mutated, never replaced. */
  static install(): void {
    const existing: unknown = Reflect.get(globalThis, GroupArtifactsResolver.REALM_SLOT);
    const holder: { resolve?: unknown } =
      typeof existing === 'object' && existing !== null ? existing : {};
    holder.resolve = (resolveOpts: {
      group: {
        folder: string | undefined;
        site: string | undefined;
        ignore?: ReadonlyArray<string>;
      };
    }) => GroupArtifactsResolver.resolve(resolveOpts);
    Reflect.set(globalThis, GroupArtifactsResolver.REALM_SLOT, holder);
  }
}
