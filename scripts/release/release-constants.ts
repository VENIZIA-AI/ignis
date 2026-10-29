/** The `npm version` modes release.ts accepts. */
export class ReleaseModes {
  static readonly PATCH = 'patch';
  static readonly MINOR = 'minor';
  static readonly MAJOR = 'major';
  static readonly PREPATCH = 'prepatch';
  static readonly PREMINOR = 'preminor';
  static readonly PREMAJOR = 'premajor';
  static readonly PRERELEASE = 'prerelease';

  /** The modes that publish a stable version. */
  static readonly STABLE_SET: ReadonlySet<string> = new Set<string>([
    this.PATCH,
    this.MINOR,
    this.MAJOR,
  ]);

  static readonly SCHEME_SET = new Set<string>([
    this.PATCH,
    this.MINOR,
    this.MAJOR,
    this.PREPATCH,
    this.PREMINOR,
    this.PREMAJOR,
    this.PRERELEASE,
  ]);

  static isValid(value: string): value is TReleaseMode {
    return this.SCHEME_SET.has(value);
  }

  /** A stable bump publishes under `latest`, any `pre*` bump under `next`. */
  static toDistTag(opts: { mode: string }): string {
    return this.STABLE_SET.has(opts.mode) ? NpmDistTags.LATEST : NpmDistTags.NEXT;
  }
}

export type TReleaseMode = Extract<(typeof ReleaseModes)[keyof typeof ReleaseModes], string>;

/**
 * The nine packages in dependency order, not alphabetical. A package must publish after everything it
 * depends on, or the registry check on its dependencies fails on a version that is not out yet.
 *
 * `core-worker` depends on kernel only, so it does not wait for connectors or core-server; it sits in the
 * one sequence anyway because a release is one run that publishes one package at a time.
 */
export class ReleaseOrder {
  static readonly NAMES = [
    'dev-configs',
    'inversion',
    'filter',
    'helpers',
    'boot',
    'kernel',
    'connectors',
    'core-worker',
    'core-server',
  ] as const;

  static readonly SCHEME_SET = new Set<string>(this.NAMES);

  static isKnown(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }

  /** The given names in release order. Unknown names are the caller's to refuse; they sort last. */
  static sort(opts: { names: ReadonlyArray<string> }): string[] {
    const rank = (name: string): number => {
      const index = (this.NAMES as ReadonlyArray<string>).indexOf(name);
      return index < 0 ? this.NAMES.length : index;
    };

    return [...opts.names].sort((left, right) => rank(left) - rank(right));
  }
}

/** The npm dist-tags a release publishes under. */
export class NpmDistTags {
  static readonly LATEST = 'latest';
  static readonly NEXT = 'next';

  static readonly SCHEME_SET = new Set<string>([this.LATEST, this.NEXT]);

  static isValid(value: string): value is TNpmDistTag {
    return this.SCHEME_SET.has(value);
  }
}

export type TNpmDistTag = Extract<(typeof NpmDistTags)[keyof typeof NpmDistTags], string>;
