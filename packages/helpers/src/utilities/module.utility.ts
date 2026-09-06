import { createRequire } from 'node:module';
import path from 'node:path';
import type { AnyType } from '@/common/types';
import { LoggerFactory } from '@/modules/logger';
import { getError } from '@/modules/error';

const logger = LoggerFactory.getLogger(['ModuleUtility']);

/** Loads an optional peer without letting `Bun.build` see it: every specifier stays a parameter, so there is no literal (nor a `minify.syntax`-folded const) for the bundler to resolve. */
export class ModuleUtility {
  /** Peers handed over by the application, keyed by specifier. Checked before any filesystem lookup. The map lives in a globalThis slot because a process (or a compiled bundle) can carry two copies of this module, and a peer registered through one copy must be found by the other. */
  private static readonly registered: Map<string, AnyType> = ModuleUtility.sharedRegistry();

  private static sharedRegistry(): Map<string, AnyType> {
    const slot = Symbol.for('ignis:module-registry');
    const shared: Map<string, AnyType> | undefined = Reflect.get(globalThis, slot);
    if (shared) {
      return shared;
    }

    const created = new Map<string, AnyType>();
    Reflect.set(globalThis, slot, created);

    return created;
  }

  /** The application's project root, shared across module copies like the registry; `process.cwd()` until an application sets it. */
  private static readonly PROJECT_ROOT_SLOT = Symbol.for('ignis:project-root');

  /** Called by the application once it knows its root (`configs.projectRoot` or the cwd); every peer lookup below follows it. */
  static setProjectRoot(opts: { projectRoot: string }): void {
    Reflect.set(globalThis, this.PROJECT_ROOT_SLOT, opts.projectRoot);
  }

  static getProjectRoot(): string {
    const shared: string | undefined = Reflect.get(globalThis, this.PROJECT_ROOT_SLOT);
    return shared ?? process.cwd();
  }

  /** Resolves peers against the APP's node_modules (under the project root), not this package's own `dist/` location. */
  private static appRequire() {
    return createRequire(path.join(this.getProjectRoot(), 'node_modules'));
  }

  private static fail(opts: { method: string; module: string; error: unknown; scope?: string }) {
    const { method, module, error, scope } = opts;
    const reason = error instanceof Error ? error.message : String(error);

    logger.for(method).error("Failed to load '%s' | Error: %s", module, reason);

    return getError({
      message: `[ModuleUtility.${method}] ${module} is required${
        scope ? ` for ${scope}` : ''
      }. Please install '${module}' | Error: ${reason}`,
    });
  }

  /**
   * Hands the framework a peer the application already holds, so no filesystem lookup is needed.
   * A `bun build --compile` binary ships without `node_modules`, which leaves runtime resolution
   * nothing to resolve against: the application imports such a peer statically - that import is
   * what gets it into the binary - and registers it here before the consuming component boots.
   *
   * Deliberately does not log. It runs at the entrypoint of exactly the deployment that has no
   * logger provider yet, where `LoggerFactory` throws - and a throw mid-loop would drop every
   * module after the first.
   */
  static register(opts: { modules: Record<string, AnyType> }): void {
    for (const [module, value] of Object.entries(opts.modules)) {
      this.registered.set(module, value);
    }
  }

  /** Loads the module. Use this everywhere except a constructor, which cannot await. */
  static async load<T = AnyType>(opts: { module: string }): Promise<T> {
    const { module } = opts;

    if (this.registered.has(module)) {
      return this.registered.get(module) as T;
    }

    try {
      return (await import(module)) as T;
    } catch (error) {
      throw this.fail({ method: 'load', module, error });
    }
  }

  /** Sync twin of {@link load}, for a constructor or any path that cannot await. */
  static loadSync<T = AnyType>(opts: { module: string }): T {
    const { module } = opts;

    if (this.registered.has(module)) {
      return this.registered.get(module) as T;
    }

    try {
      return this.appRequire()(module) as T;
    } catch (error) {
      throw this.fail({ method: 'loadSync', module, error });
    }
  }

  /**
   * Presence check only - throws naming what to install, without executing the module.
   *
   * `allowRegistered` must be set only where {@link load} or {@link loadSync} is what finally loads
   * the module. Where the consumer resolves the specifier itself - `pino.transport()` inside a
   * worker thread, or any caller with its own `createRequire` - the registry cannot reach it, and
   * counting a registration as installed would replace this precise error with an opaque one.
   */
  static assertInstalled(opts: {
    modules: Array<string>;
    scope?: string;
    allowRegistered?: boolean;
  }): void {
    const { modules, scope, allowRegistered = false } = opts;
    const appRequire = this.appRequire();

    for (const module of modules) {
      if (allowRegistered && this.registered.has(module)) {
        continue;
      }

      try {
        appRequire.resolve(module);
      } catch (error) {
        throw this.fail({ method: 'assertInstalled', module, error, scope });
      }
    }
  }
}
