import { createRequire } from 'node:module';
import path from 'node:path';
import type { AnyType } from '@/common/types';
import { LoggerFactory } from '@/modules/logger';
import { getError } from '@/modules/error';

const logger = LoggerFactory.getLogger(['ModuleUtility']);

/** Imports an optional peer through a function boundary so `Bun.build` cannot resolve the specifier at bundle time - literal (or `minify.syntax`-folded const) specifiers break consumers that compile without the peer installed. */
export const importOptionalModule = async <T = AnyType>(opts: { module: string }): Promise<T> => {
  try {
    return (await import(opts.module)) as T;
  } catch (error) {
    logger
      .for('importOptionalModule')
      .error("Failed to import '%s' | Error: %s", opts.module, error);
    throw getError({
      message: `[importOptionalModule] ${opts.module} is required. Please install '${opts.module}' | Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
};

/** Uses `createRequire` from the process CWD (not this utility's own `packages/helpers/dist/` location) so peer deps resolve against the app's node_modules; fully synchronous. `validateModule` is an async wrapper kept for API back-compat. */
export const validateModuleSync = (opts: { scope?: string; modules: Array<string> }): void => {
  const { scope = '', modules = [] } = opts;
  const appRequire = createRequire(path.join(process.cwd(), 'node_modules'));
  for (const module of modules) {
    try {
      appRequire.resolve(module);
    } catch (error) {
      logger.for('validateModule').error("Failed to import '%s' | Error: %s", module, error);
      throw getError({
        message: `[validateModule] ${module} is required${scope ? ` for ${scope}` : ''}. Please install '${module}'`,
      });
    }
  }
};

/** Async wrapper over `validateModuleSync` - kept `async` for API back-compat even though the body never awaits anything. */
export const validateModule = async (opts: { scope?: string; modules: Array<string> }) => {
  validateModuleSync(opts);
};
