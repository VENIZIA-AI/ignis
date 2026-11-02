/** What the release plan needs to know about one package. */
export interface IPlanPackage {
  /** The folder name under `packages/`, the name `release.ts` takes on its command line. */
  name: string;
  /** The npm name. */
  packageName: string;
  /** The npm names of the workspace packages it ships as dependencies or peer dependencies, or (a package that ships presets) bakes into its presets. */
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
  /** A package that ships presets (`vulcan.presets`) bakes the versions of the tools its templates name into them. */
  vulcan?: { presets?: Record<string, string> };
}

export class ReleasePlan {
  /**
   * The npm names a package must be released after: what it ships as `dependencies` or `peerDependencies`, and, when it
   * ships presets, the workspace packages its preset templates name. A project made from a preset reads
   * `dist/presets/<kind>/preset.json`, which `scripts/preset/vulcan-preset.ts` builds from `presets/<kind>/preset.json`
   * and in which every `workspace:*` becomes the workspace version at build time. A preset package published before a
   * tool its templates name is bumped therefore keeps handing out the old tool (`@venizia/ignis` 0.4.7-3 did, with a
   * boot that threw under Node). `presets` are the parsed templates; a package that ships none depends on its
   * `dependencies` and `peerDependencies` only, and a `devDependency` is never published and never counts.
   */
  static dependsOn(opts: { manifest: IPlanManifest; presets?: ReadonlyArray<unknown> }): string[] {
    const { manifest, presets = [] } = opts;
    const shipsPresets = Object.keys(manifest.vulcan?.presets ?? {}).length > 0;

    return [
      ...new Set([
        ...Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }),
        ...(shipsPresets
          ? presets.flatMap((preset) => ReleasePlan.workspaceNames({ value: preset }))
          : []),
      ]),
    ];
  }

  /** Every package name a preset template gives as `workspace:*` (or another `workspace:` range), in any dependency block. */
  static workspaceNames(opts: { value: unknown }): string[] {
    const { value } = opts;
    if (typeof value !== 'object' || value === null) {
      return [];
    }

    return Object.entries(value).flatMap(([key, child]) =>
      typeof child === 'string' && child.startsWith('workspace:')
        ? [key]
        : ReleasePlan.workspaceNames({ value: child }),
    );
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
