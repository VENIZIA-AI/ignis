import { describe, expect, test } from 'bun:test';
import { Environment } from '@/modules/env';

/** `DEVELOPMENT_ENVS` is the allowlist the error middleware consults before letting a response
 * carry a stack trace, SQL constraint name, or raw driver message - anything not in it is treated
 * as production, so it must hold only environments our own engineers reach. */
describe('Environment.DEVELOPMENT_ENVS - who may see an unsanitized error', () => {
  test('dev is the same environment as development, spelled short', () => {
    // A deployment writing NODE_ENV=dev means development; treating the abbreviation as an unknown
    // environment would silently strip the details its engineers rely on.
    expect(Environment.DEVELOPMENT_ENVS.has('dev')).toBe(true);
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.DEVELOPMENT)).toBe(true);
  });

  test('dev is a RECOGNIZED environment, so DEBUG logging still reaches it', () => {
    // The logger gates debug output on COMMON_ENVS: an unrecognized NODE_ENV silences DEBUG=true
    // entirely, which is the opposite of what a developer setting NODE_ENV=dev wants.
    expect(Environment.COMMON_ENVS.has('dev')).toBe(true);
  });

  test('local, debug and sit are development environments', () => {
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.LOCAL)).toBe(true);
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.DEBUG)).toBe(true);
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.SIT)).toBe(true);
  });

  test('alpha, beta, uat and staging are NOT - real users reach them', () => {
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.ALPHA)).toBe(false);
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.BETA)).toBe(false);
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.UAT)).toBe(false);
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.STAGING)).toBe(false);
  });

  test('production is NOT, and neither is an unknown environment name', () => {
    expect(Environment.DEVELOPMENT_ENVS.has(Environment.PRODUCTION)).toBe(false);
    expect(Environment.DEVELOPMENT_ENVS.has('whatever-someone-typed')).toBe(false);
  });

  test('Environment.current is left ALONE - it reports NODE_ENV verbatim', () => {
    const original = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = 'dev';
      // Normalizing here would change every value the framework reports downstream - including
      // payloads apps build from it. The alias belongs in the allowlist, not in the reading.
      expect(Environment.current).toBe('dev');
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
