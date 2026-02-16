import { LoggerFactory } from '@/modules/logger';
import { getError } from '@/modules/error';

const logger = LoggerFactory.getLogger(['ModuleUtility']);

export const validateModule = async (opts: { scope?: string; modules: Array<string> }) => {
  const { scope = '', modules = [] } = opts;
  for (const module of modules) {
    try {
      await import(module);
    } catch (error) {
      logger.for('validateModule').error("Failed to import '%s' | Error: %s", module, error);
      throw getError({
        message: `[validateModule] ${module} is required${scope ? ` for ${scope}` : ''}. Please install '${module}'`,
      });
    }
  }
};
