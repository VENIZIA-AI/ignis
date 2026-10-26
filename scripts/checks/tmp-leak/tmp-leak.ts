/**
 * Fails when a test run leaves something in a temp directory it should not: anything new in the
 * system temp directory (a test or script used `/tmp` instead of `TMPDIR`), or anything new in the
 * repository's own `.agents/local/tmp` (a test made a folder and did not remove it).
 *
 * `make` exports TMPDIR as that repository folder, so `os.tmpdir()` lands there. Two steps around a
 * test run: `snapshot` before it, `verify` after it. Usage: bun scripts/checks/tmp-leak/cli.ts snapshot|verify
 *
 * Only what the run itself made counts: a name that was already there, that the current user does
 * not own, or that was created before the snapshot is not the run's doing.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface ISnapshot {
  at: number;
  system: string[];
  repo: string[];
}

interface IAllowedPath {
  pattern: RegExp;
  reason: string;
}

export class TmpLeak {
  /**
   * The sanctioned system-temp paths. Each is listed by `verify` when seen, never ignored silently.
   * Add one only with a reason, and remove it in a `finally` (rule: nothing outside the repository).
   */
  static readonly ALLOWED_SYSTEM_PATHS: IAllowedPath[] = [
    {
      pattern: /^ignis-clean-install-/,
      reason:
        'the clean-install gate: a sandbox below the repository would resolve the repository node_modules',
    },
  ];

  /** The repository's temp folder: gitignored, the value `make` exports as TMPDIR. */
  static repoTmp(opts: { root?: string } = {}): string {
    return join(opts.root ?? resolve(import.meta.dir, '../../..'), '.agents/local/tmp');
  }

  /** The machine's real temp folder, which a test must not write to. Override: IGNIS_SYSTEM_TMPDIR. */
  static systemTmp(): string {
    return process.env.IGNIS_SYSTEM_TMPDIR ?? '/tmp';
  }

  /** Entry names of a folder; a dot file (the snapshot itself, X11 locks) is not a test's doing. */
  static list(opts: { dir: string }): string[] {
    if (!existsSync(opts.dir)) {
      return [];
    }
    return readdirSync(opts.dir)
      .filter((name) => !name.startsWith('.'))
      .sort();
  }

  /** Names in `after` that were not in `before` and that `ignore` does not match. */
  static added(opts: { before: string[]; after: string[]; ignore?: RegExp }): string[] {
    const known = new Set(opts.before);
    return opts.after.filter((name) => !known.has(name) && !opts.ignore?.test(name));
  }

  /** Whether the current user created `path` at or after `since` (ms); false when it is gone. */
  static madeByRun(opts: { path: string; since: number }): boolean {
    try {
      const stat = statSync(opts.path);
      const uid = process.getuid?.();
      return (uid === undefined || stat.uid === uid) && stat.ctimeMs >= opts.since - 1000;
    } catch {
      return false;
    }
  }

  static snapshotFile(opts: { repoTmp: string }): string {
    return join(opts.repoTmp, '.tmp-leak-snapshot.json');
  }

  static snapshot(opts: { repoTmp: string; systemTmp: string }): void {
    mkdirSync(opts.repoTmp, { recursive: true });
    const state: ISnapshot = {
      at: Date.now(),
      system: TmpLeak.list({ dir: opts.systemTmp }),
      repo: TmpLeak.list({ dir: opts.repoTmp }),
    };
    writeFileSync(TmpLeak.snapshotFile(opts), JSON.stringify(state));
  }

  private static readSnapshot(opts: { file: string }): ISnapshot {
    const state: unknown = JSON.parse(readFileSync(opts.file, 'utf8'));
    const isNames = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every((name) => typeof name === 'string');
    if (
      typeof state !== 'object' ||
      state === null ||
      !('at' in state) ||
      !('system' in state) ||
      !('repo' in state) ||
      typeof state.at !== 'number' ||
      !isNames(state.system) ||
      !isNames(state.repo)
    ) {
      throw new Error(`[tmp-leak] unreadable snapshot ${opts.file}; run "snapshot" again`);
    }
    return { at: state.at, system: state.system, repo: state.repo };
  }

  /** `leaks` fail the gate; `allowed` are sanctioned system-temp paths the run made, listed for the log. */
  static verify(opts: { repoTmp: string; systemTmp: string; ignore?: RegExp }): {
    leaks: string[];
    allowed: string[];
  } {
    const file = TmpLeak.snapshotFile(opts);
    if (!existsSync(file)) {
      throw new Error(`[tmp-leak] no snapshot at ${file}; run "snapshot" before the tests`);
    }
    const state = TmpLeak.readSnapshot({ file });
    const madeInside = (dir: string, names: string[]) =>
      names.filter((name) => TmpLeak.madeByRun({ path: join(dir, name), since: state.at }));
    const system = madeInside(
      opts.systemTmp,
      TmpLeak.added({
        before: state.system,
        after: TmpLeak.list({ dir: opts.systemTmp }),
        ignore: opts.ignore,
      }),
    );
    const repo = TmpLeak.added({
      before: state.repo,
      after: TmpLeak.list({ dir: opts.repoTmp }),
      ignore: opts.ignore,
    });
    const isAllowed = (name: string) =>
      TmpLeak.ALLOWED_SYSTEM_PATHS.some((allowed) => allowed.pattern.test(name));
    return {
      leaks: [
        ...system
          .filter((name) => !isAllowed(name))
          .map((name) => `${join(opts.systemTmp, name)} (system temp: use os.tmpdir(), not /tmp)`),
        ...repo.map(
          (name) => `${join(opts.repoTmp, name)} (left behind: remove it when the test ends)`,
        ),
      ],
      allowed: system.filter(isAllowed).map((name) => join(opts.systemTmp, name)),
    };
  }
}
