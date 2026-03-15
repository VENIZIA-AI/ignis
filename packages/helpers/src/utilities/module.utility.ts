import { createRequire } from 'node:module';
import path from 'node:path';
import { LoggerFactory } from '@/modules/logger';
import { getError } from '@/modules/error';

const logger = LoggerFactory.getLogger(['ModuleUtility']);

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
