/** What the release plan needs to know about one package. */
export interface IPlanPackage {
  /** The folder name under `packages/`, the name `release.ts` takes on its command line. */
  name: string;
  /** The npm name. */
  packageName: string;
  /** The npm names of the workspace packages it ships as dependencies or peer dependencies. */
  dependsOn: ReadonlyArray<string>;
  /** Source files changed since its own last release; `Infinity` when it never had one. */
  changedFiles: number;
}

export interface IPlannedPackage {
  name: string;
  /** Set when the package has no source change of its own: the packages it is released for. */
  cascadedFrom?: string[];
}

/** The slice of a package manifest the plan reads. */
export interface IPlanManifest {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  /** A package that ships presets (`vulcan.presets`) has its packed `devDependencies` read as the preset's catalog. */
  vulcan?: { presets?: Record<string, string> };
}

export class ReleasePlan {
  /**
   * The npm names a package must be released after: what it ships as `dependencies` or `peerDependencies`, and, when
   * it ships presets, its `devDependencies` too. A project made from a preset reads the packed `devDependencies` of
   * the package that holds it as its version catalog (`bun pm pack` replaces `workspace:*` there with the workspace
   * version at pack time, as it does in `dependencies`), so a preset package published before a tool it lists is
   * bumped keeps handing out the old tool. For any other package a `devDependency` is never published and never counts.
   */
  static dependsOn(opts: { manifest: IPlanManifest }): string[] {
    const { manifest } = opts;
    const shipsPresets = Object.keys(manifest.vulcan?.presets ?? {}).length > 0;

    return Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...(shipsPresets ? manifest.devDependencies : {}),
    });
  }

  /**
   * The packages a full sweep releases: the ones with source changes, plus every package that
   * depends on one of them, transitively.
   *
   * The published manifests pin internal dependencies EXACTLY (`@venizia/ignis-worker@0.4.1` needs
   * kernel `0.4.1`), so a package left behind keeps pointing at the old version and a consumer
   * installs both copies. `packages` must be in dependency order; the result keeps that order.
   */
  static planFullSweep(opts: { packages: ReadonlyArray<IPlanPackage> }): IPlannedPackage[] {
    const planned: IPlannedPackage[] = [];
    const releasedNames = new Set<string>();

    for (const pkg of opts.packages) {
      if (pkg.changedFiles > 0) {
        planned.push({ name: pkg.name });
        releasedNames.add(pkg.packageName);
        continue;
      }

      const cascadedFrom = pkg.dependsOn.filter((dependency) => releasedNames.has(dependency));
      if (cascadedFrom.length > 0) {
        planned.push({ name: pkg.name, cascadedFrom });
        releasedNames.add(pkg.packageName);
      }
    }

    return planned;
  }
}
