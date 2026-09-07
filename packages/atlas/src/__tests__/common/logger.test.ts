import { StderrLogger } from '@/common/logger';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';

const LEVEL_ENV_KEY = 'APP_ENV_LOGGER_LEVEL';
const originalLevel = process.env[LEVEL_ENV_KEY];

const restoreLevelEnv = (): void => {
  if (originalLevel === undefined) {
    delete process.env[LEVEL_ENV_KEY];
  } else {
    process.env[LEVEL_ENV_KEY] = originalLevel;
  }
};

afterEach(restoreLevelEnv);

describe('StderrLogger level threshold (M2)', () => {
  test('default threshold is info: a debug call writes nothing, a warn call writes one line', () => {
    delete process.env[LEVEL_ENV_KEY];
    const logger = StderrLogger.get('logger-test-default-threshold');
    const errorSpy = spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      logger.debug('a debug line');
      expect(errorSpy).not.toHaveBeenCalled();

      logger.warn('a warn line');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('APP_ENV_LOGGER_LEVEL=debug lets a debug call through', () => {
    process.env[LEVEL_ENV_KEY] = 'debug';
    const logger = StderrLogger.get('logger-test-debug-override');
    const errorSpy = spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      logger.debug('a debug line');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('the threshold is fixed at construction, not re-read on every call', () => {
    delete process.env[LEVEL_ENV_KEY];
    const logger = StderrLogger.get('logger-test-construction-once');
    process.env[LEVEL_ENV_KEY] = 'debug';
    const errorSpy = spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      logger.debug('still dropped - this instance was built while the threshold was info');
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
