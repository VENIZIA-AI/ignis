import { describe, expect, test } from 'bun:test';

/** Loading the module twice through the CommonJS cache is the in-process shape of an ESM import beside a CommonJS require: two module copies, two class identities. */
const loadTwice = () => {
  const modulePath = require.resolve('../../modules/env/app-env');
  const first = require(modulePath);
  delete require.cache[modulePath];
  const second = require(modulePath);
  return { first, second };
};

describe('applicationEnvironment across module copies', () => {
  test('two copies of the module resolve one instance, so a value set through one is read through the other', () => {
    const { first, second } = loadTwice();

    expect(first.ApplicationEnvironment).not.toBe(second.ApplicationEnvironment);
    expect(first.applicationEnvironment).toBe(second.applicationEnvironment);

    first.applicationEnvironment.set('APP_ENV_SHARED_PROBE', 'seen-by-both');
    expect(second.applicationEnvironment.get('APP_ENV_SHARED_PROBE')).toBe('seen-by-both');
  });
});
