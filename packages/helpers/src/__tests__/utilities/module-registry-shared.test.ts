import { describe, expect, test } from 'bun:test';

/** Two loads through the CommonJS cache are two module copies - the shape of an ESM import beside a CommonJS require in one process, or two copies inside one compiled bundle. */
const loadTwice = () => {
  const modulePath = require.resolve('../../utilities/module.utility');
  const first = require(modulePath);
  delete require.cache[modulePath];
  const second = require(modulePath);
  return { first, second };
};

describe('ModuleUtility.register across module copies', () => {
  test('a peer registered through one copy is loaded through the other without touching the filesystem', async () => {
    const { first, second } = loadTwice();
    expect(first.ModuleUtility).not.toBe(second.ModuleUtility);

    const handedOver = { marker: 'registered-through-first-copy' };
    first.ModuleUtility.register({ modules: { '@definitely/not-installed-shared': handedOver } });

    const loaded = await second.ModuleUtility.load({ module: '@definitely/not-installed-shared' });
    expect(loaded).toBe(handedOver);
  });
});
