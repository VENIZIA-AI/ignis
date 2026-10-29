/**
 * What the npm registry says about a version, asked fresh. The packument (the document that lists every
 * version of a package) can lag a publish by minutes, and a tarball can lag the packument, so "is this version
 * out" has two witnesses: the packument lists it, or its tarball answers 200. Either one counts as out.
 */
const REGISTRY = 'https://registry.npmjs.org';

type TFetch = (
  url: string,
  init?: { method?: string; cache?: 'no-store' },
) => Promise<{ ok: boolean; status: number; json?: () => Promise<any> }>;

type TPackumentRead =
  | { kind: 'versions'; versions: string[] }
  | { kind: 'http'; status: number }
  | { kind: 'error'; message: string };

export class ReleaseRegistry {
  /** `https://registry.npmjs.org/@scope/name/-/name-1.2.3.tgz`: the file is named by the unscoped name. */
  static tarballUrl(opts: { packageName: string; version: string }): string {
    const unscoped = opts.packageName.split('/').pop() ?? opts.packageName;
    return `${REGISTRY}/${opts.packageName}/-/${unscoped}-${opts.version}.tgz`;
  }

  /** What reading the packument gave: its versions, an HTTP refusal, or a network error. */
  private static async readVersions(opts: {
    packageName: string;
    fetchFn: TFetch;
  }): Promise<TPackumentRead> {
    try {
      const response = await opts.fetchFn(`${REGISTRY}/${opts.packageName}`, { cache: 'no-store' });
      if (!response.ok) {
        return { kind: 'http', status: response.status };
      }

      const packument = (await response.json?.()) as { versions?: Record<string, unknown> };
      return { kind: 'versions', versions: Object.keys(packument?.versions ?? {}) };
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  /** True when the packument lists the version or its tarball answers 200. An error is "not found", never "found". */
  static async isPublished(opts: {
    packageName: string;
    version: string;
    fetchFn?: TFetch;
  }): Promise<boolean> {
    const { packageName, version, fetchFn = fetch as unknown as TFetch } = opts;

    const versions = await this.readVersions({ packageName, fetchFn });
    if (versions.kind === 'versions' && versions.versions.includes(version)) {
      return true;
    }

    try {
      const response = await fetchFn(this.tarballUrl({ packageName, version }), { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * The dependencies the registry cannot serve, as one line each. A `@venizia/*` dependency pinned to an exact
   * version is checked with `isPublished` (a sibling released minutes ago may not be in the packument yet); any
   * other range needs some published version that satisfies it.
   */
  static async findMissing(opts: {
    dependencies: Record<string, string>;
    fetchFn?: TFetch;
  }): Promise<string[]> {
    const { dependencies, fetchFn = fetch as unknown as TFetch } = opts;
    const missing: string[] = [];

    for (const [packageName, range] of Object.entries(dependencies)) {
      const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(range);
      if (packageName.startsWith('@venizia/') && exact) {
        if (!(await this.isPublished({ packageName, version: range, fetchFn }))) {
          missing.push(`${packageName}@${range} - not on the registry`);
        }
        continue;
      }

      const read = await this.readVersions({ packageName, fetchFn });
      if (read.kind === 'error') {
        missing.push(`${packageName}@${range} - could not reach the registry (${read.message})`);
        continue;
      }
      if (read.kind === 'http') {
        missing.push(
          `${packageName}@${range} - the package itself is not on the registry (HTTP ${read.status})`,
        );
        continue;
      }
      if (!read.versions.some((version) => Bun.semver.satisfies(version, range))) {
        missing.push(`${packageName}@${range} - no published version satisfies this range`);
      }
    }

    return missing;
  }
}
