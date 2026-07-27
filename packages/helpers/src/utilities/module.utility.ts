import { createRequire } from 'node:module';
import path from 'node:path';
import type { AnyType } from '@/common/types';
import { LoggerFactory } from '@/modules/logger';
import { getError } from '@/modules/error';

const logger = LoggerFactory.getLogger(['ModuleUtility']);

/** Loads an optional peer without letting `Bun.build` see it: every specifier stays a parameter, so there is no literal (nor a `minify.syntax`-folded const) for the bundler to resolve. */
export class ModuleUtility {
  /** Peers handed over by the application, keyed by specifier. Checked before any filesystem lookup. */
  private static readonly registered = new Map<string, AnyType>();

  /** Resolves peers against the APP's node_modules, not this package's own `dist/` location. */
  private static appRequire() {
    return createRequire(path.join(process.cwd(), 'node_modules'));
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
   */
  static register(opts: { modules: Record<string, AnyType> }): void {
    for (const [module, value] of Object.entries(opts.modules)) {
      this.registered.set(module, value);
      logger.for(this.register.name).debug("Registered module: '%s'", module);
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

  /** Presence check only - throws naming what to install, without executing the module. */
  static assertInstalled(opts: { modules: Array<string>; scope?: string }): void {
    const { modules, scope } = opts;
    const appRequire = this.appRequire();

    for (const module of modules) {
      if (this.registered.has(module)) {
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
