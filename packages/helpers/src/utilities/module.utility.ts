import { applicationLogger as logger } from '@/helpers/logger';
import { getError } from '@/helpers/error';

export const validateModule = async (opts: { scope?: string; modules: Array<string> }) => {
  const { scope = '', modules = [] } = opts;
  for (const module of modules) {
    try {
      await import(module);
    } catch (error) {
      logger.error("[validateModule] Failed to import '%s' | Error: %s", module, error);
      throw getError({
        message: `[validateModule] ${module} is required${scope ? ` for ${scope}` : ''}. Please install '${module}'`,
      });
    }
  }
};
