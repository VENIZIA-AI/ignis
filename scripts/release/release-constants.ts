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
}

export type TReleaseMode = Extract<(typeof ReleaseModes)[keyof typeof ReleaseModes], string>;

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
