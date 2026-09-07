import { LoggerResolver } from '@/modules/logger/resolver';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

/** Two loads through the CommonJS cache give a resolver with no provider installed, the state of a script that only imports the barrel. */
const loadFreshResolver = () => {
  const modulePath = require.resolve('../../modules/logger/resolver');
  delete require.cache[modulePath];
  const fresh: { LoggerResolver: typeof LoggerResolver } = require(modulePath);
  return fresh.LoggerResolver;
};

describe('console fallback warning', () => {
  let warn: ReturnType<typeof spyOn>;

  beforeEach(() => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('acquiring a logger does not warn; the first line routed to the console warns exactly once', () => {
    const Resolver = loadFreshResolver();

    const logger = Resolver.resolve({ scopes: ['probe'] });
    expect(warn).not.toHaveBeenCalled();

    logger.info('first line');
    logger.info('second line');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('no logger provider is installed');
  });
});
