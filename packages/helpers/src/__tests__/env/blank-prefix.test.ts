import { afterEach, describe, expect, test } from 'bun:test';

/**
 * `APPLICATION_ENV_PREFIX=` is a pipeline that forgot to export the value. Read with `??` it
 * resolves to `''`, and `key.startsWith('')` is true for EVERY name, so the environment map
 * swallows the whole of `process.env` - `PATH`, `HOME` and any system secret alongside it.
 * `validateEnvs` then iterates that list and throws on the first unrelated empty variable, and
 * `keys()` publishes the names.
 *
 * The singleton is cached in a `globalThis` slot, so re-evaluating the module is not enough on its
 * own: the slot has to be cleared for the constructor to run again.
 */
const INSTANCE_SLOT = Symbol.for('ignis:application-environment');
const MODULE_PATH = require.resolve('../../modules/env/app-env');

const loadWithPrefix = (opts: { prefix: string | undefined }) => {
  const previous = process.env.APPLICATION_ENV_PREFIX;

  if (opts.prefix === undefined) {
    delete process.env.APPLICATION_ENV_PREFIX;
  } else {
    process.env.APPLICATION_ENV_PREFIX = opts.prefix;
  }

  Reflect.deleteProperty(globalThis, INSTANCE_SLOT);
  delete require.cache[MODULE_PATH];

  const loaded = require(MODULE_PATH);

  if (previous === undefined) {
    delete process.env.APPLICATION_ENV_PREFIX;
  } else {
    process.env.APPLICATION_ENV_PREFIX = previous;
  }

  return loaded.applicationEnvironment;
};

describe('the default environment prefix', () => {
  afterEach(() => {
    // Leave the slot and the module cache as the rest of the suite expects to find them.
    Reflect.deleteProperty(globalThis, INSTANCE_SLOT);
    delete require.cache[MODULE_PATH];
    require(MODULE_PATH);
  });

  // `every()` on an empty list is vacuously true, so each case asserts the map is POPULATED first -
  // otherwise a prefix that matches nothing passes for the wrong reason.
  const expectPrefixedOnly = (keys: Array<string>) => {
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).not.toContain('PATH');
    expect(keys).not.toContain('HOME');
    expect(keys.filter(key => !key.startsWith('APP_ENV'))).toEqual([]);
  };

  test('a blank APPLICATION_ENV_PREFIX falls back to APP_ENV, it does not swallow process.env', () => {
    expectPrefixedOnly(loadWithPrefix({ prefix: '' }).keys());
  });

  test('a whitespace-only prefix falls back too', () => {
    expectPrefixedOnly(loadWithPrefix({ prefix: '   ' }).keys());
  });

  test('an unset prefix still defaults to APP_ENV', () => {
    expectPrefixedOnly(loadWithPrefix({ prefix: undefined }).keys());
  });

  test('a real custom prefix is still honoured', () => {
    process.env.NX_PROBE_VALUE = 'probe';
    const environment = loadWithPrefix({ prefix: 'NX_PROBE' });
    delete process.env.NX_PROBE_VALUE;

    expect(environment.keys()).toContain('NX_PROBE_VALUE');
  });
});
