import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnyType } from '@/common/types';
import { LoggerFactory } from '@/modules/logger';
import { getError } from '@/modules/error';
import { ProjectRootRegistry } from './project-root.utility';

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

  /** Called by the application once it knows its root (`configs.projectRoot` or the cwd); every peer lookup below follows it. Delegates to `ProjectRootRegistry`, which a browser Worker host reaches too through `/core` - the two must share ONE slot. */
  static setProjectRoot(opts: { projectRoot: string }): void {
    ProjectRootRegistry.set(opts);
  }

  static getProjectRoot(): string {
    return ProjectRootRegistry.getShared() ?? process.cwd();
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
      message: `[ModuleUtility.${method}] ${module} is required, resolved from ${this.getProjectRoot()}${
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
    const modulesEntries = Object.entries(opts.modules);
    for (const [module, value] of modulesEntries) {
      this.registered.set(module, value);
    }
  }

  /**
   * The file `module` resolves to from the project root under the ES module conditions (`import`), so
   * the peer is the very instance an application's own `import` of it gets. `undefined` when it does not
   * resolve there or the runtime has no resolver: the caller falls back to a plain `import()`.
   */
  private static resolveEsmFile(opts: { module: string }): string | undefined {
    if (typeof Bun === 'undefined') {
      return undefined;
    }

    try {
      const file = Bun.resolveSync(opts.module, this.getProjectRoot());
      return path.isAbsolute(file) ? file : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Loads the module as an ES module, resolved from the project root: a peer that ships both builds
   * (`bullmq`, `socket.io-client`) is loaded as the copy the application's own `import` gets, not a second
   * one. A module handed over with {@link register} wins; one that does not resolve from the project root is
   * imported by name as before. Use this everywhere except a constructor, which cannot await - see {@link preload}.
   */
  static async load<T = AnyType>(opts: { module: string }): Promise<T> {
    const { module } = opts;

    if (this.registered.has(module)) {
      return this.registered.get(module) as T;
    }

    try {
      const file = this.resolveEsmFile({ module });
      const result = await import(file === undefined ? module : pathToFileURL(file).href);
      return result as T;
    } catch (error) {
      throw this.fail({ method: 'load', module, error });
    }
  }

  /**
   * The explicit register path for what a constructor needs: loads each module with {@link load} and
   * registers it, so the synchronous {@link loadSync} returns that ES module copy afterwards. Call it once
   * at the entrypoint, before the helpers are constructed. A module already registered is kept; every module
   * is loaded before any is registered, so one that is missing registers nothing.
   */
  static async preload(opts: { modules: Array<string> }): Promise<void> {
    const loaded: Record<string, AnyType> = {};

    for (const module of opts.modules) {
      // `load` answers from the registry first, so a module the application handed over comes back as itself.
      const result = await this.load({ module });
      loaded[module] = result;
    }

    this.register({ modules: loaded });
  }

  /**
   * Sync twin of {@link load}, for a constructor or any path that cannot await. It resolves with
   * `require`, so a peer that ships both builds comes back as its CommonJS copy - a second instance next to
   * the one an application's `import` holds, and `instanceof` across the two fails. `await preload(...)` at the
   * entrypoint registers the ES module copy first, and this returns that.
   */
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
