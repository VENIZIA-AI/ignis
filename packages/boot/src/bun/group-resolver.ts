import { getError } from '@venizia/ignis-helpers';
import type { AnyType, TClass } from '@venizia/ignis-helpers';
import { ArtifactStereotypes, type TGeneratedArtifactIndex } from '../generator';
import { ArtifactSources } from './sources';

/** Fills an `ArtifactGroup` defined without content, from source: the defining package is the nearest `package.json` above the group's call site, and the group is every decorated class under a directory named `folder` in its `src`. */
export class GroupArtifactsResolver {
  /** The kernel's `SingletonRealm` slot for the group resolver (`ArtifactGroup.SINGLETON_REALM_KEY`). */
  static readonly REALM_SLOT = Symbol.for('@venizia/ignis-kernel:artifact-group-resolver');

  static async resolve(opts: {
    group: { folder: string | undefined; site: string | undefined };
  }): Promise<TGeneratedArtifactIndex> {
    const { folder, site } = opts.group;
    if (!folder || !site) {
      throw getError({
        message: `[ArtifactGroup] '${folder ?? '<application>'}' has no call site to resolve from | Define it with ArtifactGroup.define in the shared package's own source`,
      });
    }

    const index: Record<string, Array<TClass<AnyType>>> = {};
    for (const artifact of ArtifactSources.folderArtifacts({ folder, site })) {
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
    const realm = globalThis as Record<symbol, { resolve?: unknown } | undefined>;
    const holder = realm[GroupArtifactsResolver.REALM_SLOT] ?? {};
    holder.resolve = (resolveOpts: {
      group: { folder: string | undefined; site: string | undefined };
    }) => GroupArtifactsResolver.resolve(resolveOpts);
    realm[GroupArtifactsResolver.REALM_SLOT] = holder;
  }
}
