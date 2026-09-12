import { Environment, RuntimeModules } from '@venizia/ignis-helpers';
import { BuildInfoRegistry, type TBuildInfoRecord } from '@venizia/ignis-helpers/core';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import type { IHealthCheckOptions } from './common';

/**
 * Assembles what `GET /health` and `GET /health/stats` answer.
 *
 * Never reads the filesystem and never spawns `git`: the build stamp is PUSHED in at the
 * entrypoint through {@link BuildInfoRegistry} (or the component's own options), so a
 * `bun build --compile` binary and a Distroless image - neither of which has `node_modules`,
 * `.git` or a readable `package.json` - report exactly what a dev machine does.
 */
export class HealthCheckReporter {
  private static readonly BYTES_PER_MB = 1024 * 1024;

  /** Public liveness answer: liveness and the server clock, nothing a probe cannot already see. */
  static buildSummary(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Fail-closed, copying `AppErrorMiddleware.isProduction`: the default is MEMBERSHIP in
   * `DEVELOPMENT_ENVS`, never inequality against `production`. `staging`, `uat`, `alpha` and a
   * typo all keep this route shut, because the runtime and release it names are what picks an
   * exploit. `ambient`, not `current`: an unset `NODE_ENV` is a host that cannot prove it is a dev
   * machine, and `current` would mask it as `development`.
   *
   * `enable` is compared to `true`/`false` rather than read through `??`: this binding is
   * env/config driven, and a JSON-derived `"false"` is truthy - an operator who wrote false would
   * otherwise get the route mounted.
   */
  static isStatsEnabled(opts: {
    options: IHealthCheckOptions;
    /** Reads the ambient environment; injected by tests so nothing has to write `process.env`. */
    environment?: () => string | undefined;
  }): boolean {
    const { enable } = opts.options.stats ?? {};
    if (typeof enable === 'boolean') {
      return enable;
    }

    const ambient = opts.environment ? opts.environment() : Environment.ambient;
    if (ambient === undefined) {
      return false;
    }

    return Environment.DEVELOPMENT_ENVS.has(ambient.toLowerCase());
  }

  /**
   * No `secretKey` configured leaves the route open to whatever can reach the port - stated, not
   * implied. Anything that is not a non-blank string fails CLOSED: a blank or config-derived
   * non-string key is a pipeline that lost the variable, and reading it as "no key" would publish
   * the route the operator meant to lock.
   *
   * The comparison is a plain `===`: a remote timing attack on a header compare is not practical
   * through an HTTP stack, and a constant-time digest compare would buy nothing here.
   */
  /**
   * Whether the stats route is mounted, unauthenticated, and on a host that cannot be shown to be a
   * development one. That combination stays LEGAL - on a cluster-internal port it is often the right
   * call - so this reports rather than refuses, and the component turns it into one warning at boot.
   *
   * It exists because `enable: true` bypasses the environment gate entirely: an operator who sets it
   * for a local run and ships the same code publishes the runtime version, the release and the
   * memory profile to whatever can reach the port. A blank `secretKey` is NOT unguarded - that fails
   * closed in {@link isStatsAuthorized}.
   */
  static isStatsUnguarded(opts: {
    options: IHealthCheckOptions;
    environment?: () => string | undefined;
  }): boolean {
    if (!HealthCheckReporter.isStatsEnabled(opts)) {
      return false;
    }

    if (opts.options.stats?.secretKey !== undefined) {
      return false;
    }

    const ambient = opts.environment ? opts.environment() : Environment.ambient;
    if (ambient === undefined) {
      return true;
    }

    return !Environment.DEVELOPMENT_ENVS.has(ambient.toLowerCase());
  }

  static isStatsAuthorized(opts: { options: IHealthCheckOptions; header?: string }): boolean {
    const secretKey = opts.options.stats?.secretKey;
    if (secretKey === undefined) {
      return true;
    }

    if (typeof secretKey !== 'string' || secretKey.trim().length === 0) {
      return false;
    }

    return opts.header === secretKey;
  }

  /** The slot is a process-wide `globalThis` entry any dependency can write, and `IBuildInfo` types it without checking - so a non-string never reaches the response schema, which declares `z.string()`. */
  private static extractText(opts: { value: unknown }): string | undefined {
    return typeof opts.value === 'string' && opts.value.length > 0 ? opts.value : undefined;
  }

  /**
   * Explicit options win over the registry, and the application's own `getAppInfo()` fills what
   * neither carries - so a host that ran no generator still reports its real name and version.
   */
  static resolveBuildInfo(opts: {
    options: IHealthCheckOptions;
    appInfo?: IApplicationInfo;
  }): TBuildInfoRecord {
    const stamp = opts.options.stats?.buildInfo ?? BuildInfoRegistry.get() ?? {};
    const extract = HealthCheckReporter.extractText;

    return {
      service:
        extract({ value: stamp.service }) ?? opts.appInfo?.name ?? BuildInfoRegistry.UNSPECIFIED,
      version:
        extract({ value: stamp.version }) ?? opts.appInfo?.version ?? BuildInfoRegistry.UNSPECIFIED,
      commit: extract({ value: stamp.commit }) ?? BuildInfoRegistry.UNSPECIFIED,
      branch: extract({ value: stamp.branch }) ?? BuildInfoRegistry.UNSPECIFIED,
      builtAt: extract({ value: stamp.builtAt }) ?? BuildInfoRegistry.UNSPECIFIED,
    };
  }

  /** `3661` -> `1h 1m 1s`: an operator reads a restart out of this faster than out of a float. */
  static toHumanUptime(opts: { seconds: number }): string {
    const total = Math.floor(opts.seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  private static toMegabytes(opts: { bytes: number }): string {
    return `${(opts.bytes / HealthCheckReporter.BYTES_PER_MB).toFixed(1)} MB`;
  }

  static buildStats(opts: { options: IHealthCheckOptions; appInfo?: IApplicationInfo }) {
    const memory = process.memoryUsage();
    const uptime = process.uptime();

    return {
      ...HealthCheckReporter.buildSummary(),
      build: HealthCheckReporter.resolveBuildInfo(opts),
      process: {
        pid: process.pid,
        uptime,
        uptimeHuman: HealthCheckReporter.toHumanUptime({ seconds: uptime }),
        // `versions.node` carries no `v` prefix, so both runtimes read `<name> <semver>`.
        runtime: RuntimeModules.isBun() ? `bun ${Bun.version}` : `node ${process.versions.node}`,
        // `ambient`, not `current`: an unset `NODE_ENV` is reported as such, never dressed up as `development`.
        environment: Environment.ambient ?? BuildInfoRegistry.UNSPECIFIED,
      },
      memory: {
        rss: HealthCheckReporter.toMegabytes({ bytes: memory.rss }),
        heapUsed: HealthCheckReporter.toMegabytes({ bytes: memory.heapUsed }),
        heapTotal: HealthCheckReporter.toMegabytes({ bytes: memory.heapTotal }),
      },
    };
  }
}
