import { BuildInfoRegistry, type TBuildInfoRecord } from '@venizia/ignis-helpers/core';
import { BuildInfoResolver } from './resolver';

// A compile bakes the stamp in under this name (`define`); a run from source has no such name.
// The identifier below must spell the same as `BuildInfoStamp.GLOBAL_NAME`.
declare const IGNIS_BUILD_INFO: TBuildInfoRecord | undefined;

/**
 * The build stamp, decided where it is cheap: a compile bakes it into the binary, a run from
 * source resolves it from git when the application starts.
 *
 * `define()` is for the compile script, `register()` for the entrypoint. A binary that carries the
 * stamp never runs git; the resolver is the only code here, and it needs no TypeScript scanner.
 */
export class BuildInfoStamp {
  /** The identifier `define()` replaces in the bundle and `register()` reads. */
  static readonly GLOBAL_NAME = 'IGNIS_BUILD_INFO';

  /** The `define` record for a compile: resolves the stamp now and returns it under {@link BuildInfoStamp.GLOBAL_NAME}. */
  static async define(opts?: { root?: string }): Promise<Record<string, string>> {
    const stamp = await BuildInfoResolver.getInstance().resolve(opts);
    return { [BuildInfoStamp.GLOBAL_NAME]: JSON.stringify(stamp) };
  }

  /**
   * Registers the stamp in {@link BuildInfoRegistry}: the baked value when the compile defined it,
   * else the resolver's. Only `commit`, `branch` and `builtAt` are set - `service` and `version`
   * stay with the application's `getAppInfo()`, which the health reporter reads when they are absent.
   */
  static async register(): Promise<void> {
    let stamp: TBuildInfoRecord;
    if (typeof IGNIS_BUILD_INFO !== 'undefined') {
      stamp = IGNIS_BUILD_INFO;
    } else {
      const resolved = await BuildInfoResolver.getInstance().resolve();
      stamp = resolved;
    }

    BuildInfoRegistry.set({
      buildInfo: { commit: stamp.commit, branch: stamp.branch, builtAt: stamp.builtAt },
    });
  }
}
