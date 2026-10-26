import { BaseHelper } from '@venizia/ignis-helpers';
import { BuildInfoRegistry, type TBuildInfoRecord } from '@venizia/ignis-helpers/core';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { BuildInfoEnvironmentKeys } from './common';

const execFileAsync = promisify(execFile);

/** Length of a short SHA; an env value already shorter is left alone. */
const COMMIT_LENGTH = 12;

/**
 * Resolves the stamp: environment first (CI knows the release tag), then `git`, then the
 * manifest. Every miss is logged with its reason and degrades one field to
 * {@link BuildInfoRegistry.UNSPECIFIED} - a Distroless image has no `git` and an exported tarball
 * has no manifest, and a build must not die over a stamp.
 */
export class BuildInfoResolver extends BaseHelper {
  private static instance?: BuildInfoResolver;

  private constructor() {
    super({ scope: BuildInfoResolver.name });
  }

  static getInstance(): BuildInfoResolver {
    return (this.instance ??= new BuildInfoResolver());
  }

  async resolve(opts?: { root?: string }): Promise<TBuildInfoRecord> {
    const root = resolve(opts?.root ?? process.cwd());
    const manifest = this.resolveManifest({ root });

    // Independent processes; sequencing them would double the latency of the common case for nothing.
    const [gitCommit, gitBranch] = await Promise.all([
      this.resolveGitValue({ args: ['rev-parse', `--short=${COMMIT_LENGTH}`, 'HEAD'], root }),
      this.resolveGitValue({ args: ['rev-parse', '--abbrev-ref', 'HEAD'], root }),
    ]);

    const unspecified = BuildInfoRegistry.UNSPECIFIED;
    return {
      service: manifest.name ?? unspecified,
      version:
        this.resolveEnvironmentValue({ keys: BuildInfoEnvironmentKeys.VERSION }) ??
        manifest.version ??
        unspecified,
      commit:
        this.resolveEnvironmentValue({ keys: BuildInfoEnvironmentKeys.COMMIT })?.slice(
          0,
          COMMIT_LENGTH,
        ) ??
        gitCommit ??
        unspecified,
      branch:
        this.resolveEnvironmentValue({ keys: BuildInfoEnvironmentKeys.BRANCH }) ??
        gitBranch ??
        unspecified,
      builtAt:
        this.resolveEnvironmentValue({ keys: BuildInfoEnvironmentKeys.BUILT_AT }) ??
        new Date().toISOString(),
    };
  }

  private resolveEnvironmentValue(opts: { keys: readonly string[] }): string | undefined {
    for (const key of opts.keys) {
      const value = process.env[key];
      if (value !== undefined && value.trim().length > 0) {
        return value.trim();
      }
    }

    return undefined;
  }

  /**
   * `execFile` runs `git` without a shell and works under Bun and Node alike - `Bun.$` threw a
   * `ReferenceError` under Node, which left commit and branch "unspecified" for every Node build.
   * A nonzero exit and `git` being absent are both a miss, logged and degraded to one field.
   */
  private async resolveGitValue(opts: {
    args: string[];
    root: string;
  }): Promise<string | undefined> {
    const { args, root } = opts;

    try {
      const { stdout } = await execFileAsync('git', args, { cwd: root, windowsHide: true });
      const value = stdout.trim();
      return value.length > 0 ? value : undefined;
    } catch (error) {
      // `rev-parse --abbrev-ref HEAD` in a repository with no commit prints the literal `HEAD` on
      // stdout while exiting 128, so the exit code decides and stdout alone never does: a nonzero
      // exit rejects here whatever it printed.
      const { code, stderr } = error as { code?: number | string; stderr?: string };

      if (typeof code === 'number') {
        this.logger.debug('git %s | exit: %d | %s', args.join(' '), code, (stderr ?? '').trim());
      } else {
        this.logger.debug('git %s | unavailable: %s', args.join(' '), error);
      }

      return undefined;
    }
  }

  /** `JSON.parse` promises nothing about the shape, so a manifest holding `{ "name": 42 }` must not become a numeric `service`. */
  private resolveManifest(opts: { root: string }): { name?: string; version?: string } {
    const manifest = resolve(opts.root, 'package.json');
    if (!existsSync(manifest)) {
      this.logger.debug('No package.json at %s', opts.root);
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) {
        return {};
      }

      const name = 'name' in parsed ? parsed.name : undefined;
      const version = 'version' in parsed ? parsed.version : undefined;

      return {
        name: typeof name === 'string' ? name : undefined,
        version: typeof version === 'string' ? version : undefined,
      };
    } catch (error) {
      this.logger.debug('Unreadable package.json at %s | %s', manifest, error);
      return {};
    }
  }
}
