import { createRequire } from 'node:module';
import path from 'node:path';
import type { AnyType } from '@/common/types';
import { LoggerFactory } from '@/modules/logger';
import { getError } from '@/modules/error';

const logger = LoggerFactory.getLogger(['ModuleUtility']);

/**
 * Imports an optional peer through a function boundary so `Bun.build` cannot resolve the specifier
 * at bundle time - literal (and `minify.syntax`-folded const) specifiers break consumers that
 * compile without the peer installed.
 */
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

/**
 * Validates that the specified modules are installed and resolvable.
 * Uses `createRequire` from the process CWD so peer deps in the application's
 * node_modules are found, even though this utility lives in packages/helpers/dist/.
 */
export const validateModule = async (opts: { scope?: string; modules: Array<string> }) => {
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
