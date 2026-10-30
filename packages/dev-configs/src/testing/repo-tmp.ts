/**
 * Where a test makes its temp folders: `.agents/local/tmp/tests` of the repository, never the system
 * temp. `make test` sets TMPDIR to a folder like it; this does the same for a run without make - a
 * bare `bun test` on one file - and is the one place that knows the path.
 *
 * The empty `.git` marker in it stops git and bun's ignore lookup from reading the enclosing
 * repository, so GIT_CEILING_DIRECTORIES is set to the same folder.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/** The folder under the repository root that holds a test run's temp folders. */
export const REPO_TMP_DIRECTORY = join('.agents', 'local', 'tmp', 'tests');

type TSpawn = (...args: unknown[]) => unknown;

export class RepoTmp {
  /** The nearest ancestor of `start` that holds a `.git` (folder or file); `start` itself when there is none. */
  static findRoot(opts: { start?: string } = {}): string {
    const { start = process.cwd() } = opts;
    let current = resolve(start);

    for (;;) {
      if (existsSync(join(current, '.git'))) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) {
        return resolve(start);
      }

      current = parent;
    }
  }

  /**
   * `Bun.spawn` and `Bun.spawnSync` hand a child the environment the process started with, not the one
   * it has now, so a TMPDIR set here would never reach it. Wrapped to default to the current one; an
   * `env` a caller passes wins. `spawn(cmd, options)` and `spawn({ cmd, ...options })` are both handled.
   */
  private static withCurrentEnv(spawn: TSpawn): TSpawn {
    return (...args) => {
      const [first, second] = args;
      const options = Array.isArray(first) ? second : first;

      if ((options as { env?: unknown } | undefined)?.env !== undefined) {
        return spawn(...args);
      }

      return Array.isArray(first)
        ? spawn(first, { ...(second as object), env: process.env })
        : spawn({ ...(first as object), env: process.env });
    };
  }

  /**
   * Points TMPDIR at the repository's test folder unless it is already inside it (make's value, or a
   * private folder a caller made there), and returns the folder now in force. Idempotent.
   */
  static apply(opts: { root?: string } = {}): string {
    const root = opts.root ?? RepoTmp.findRoot();
    const testTmp = join(root, REPO_TMP_DIRECTORY);
    const current = process.env.TMPDIR;

    if (current !== undefined && `${resolve(current)}${sep}`.startsWith(`${testTmp}${sep}`)) {
      return current;
    }

    mkdirSync(join(testTmp, '.git'), { recursive: true });
    process.env.TMPDIR = testTmp;
    process.env.GIT_CEILING_DIRECTORIES = testTmp;
    Bun.spawn = RepoTmp.withCurrentEnv(
      Bun.spawn as unknown as TSpawn,
    ) as unknown as typeof Bun.spawn;
    Bun.spawnSync = RepoTmp.withCurrentEnv(
      Bun.spawnSync as unknown as TSpawn,
    ) as unknown as typeof Bun.spawnSync;

    return testTmp;
  }
}

/** @deprecated Use `RepoTmp.findRoot({ start })`. Removed in 0.5. */
export const findRepositoryRoot = (start: string = process.cwd()): string =>
  RepoTmp.findRoot({ start });

/** @deprecated Use `RepoTmp.apply({ root })`. Removed in 0.5. */
export const useRepoTmp = (opts: { root?: string } = {}): string => RepoTmp.apply(opts);
