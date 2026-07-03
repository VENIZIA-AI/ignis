import { describe, test, expect } from 'bun:test';
import { TypesenseHelper } from '@/modules/search-engine/typesense/helper';
import { createFakeClient, makeHelper } from './fake-client';

describe('TypesenseHelper lifecycle', () => {
  test('getClient returns the injected client', () => {
    const { helper, fake } = makeHelper();
    expect(helper.getClient()).toBe(fake.client);
  });

  test('getHealth maps to { ok }', async () => {
    const { helper } = makeHelper({ health: { ok: true } });
    expect(await helper.getHealth()).toEqual({ ok: true });
  });

  test('ping returns boolean from health', async () => {
    const { helper } = makeHelper({ health: { ok: false } });
    expect(await helper.ping()).toBe(false);
  });

  test('onInitialized callback fires with name', () => {
    let seen = '';
    const fake = createFakeClient();
    new TypesenseHelper({
      name: 'cb-test',
      nodes: [{ host: 'localhost', port: 8108 }],
      apiKey: 'k',
      client: fake.client as never,
      onInitialized: ({ name }) => {
        seen = name;
      },
    });
    expect(seen).toBe('cb-test');
  });

  test('getHealth returns { ok: false } and does not throw when the probe fails', async () => {
    const { helper } = makeHelper({ throwOn: { 'health.retrieve': new Error('probe down') } });
    expect(await helper.getHealth()).toEqual({ ok: false });
  });

  test('onError fires and the constructor rethrows when initialization throws', () => {
    const fake = createFakeClient();
    const boom = new Error('init boom');
    let received: unknown;
    expect(
      () =>
        new TypesenseHelper({
          name: 'err-test',
          nodes: [{ host: 'localhost', port: 8108 }],
          apiKey: 'k',
          client: fake.client as never,
          onInitialized: () => {
            throw boom;
          },
          onError: ({ error }) => {
            received = error;
          },
        }),
    ).toThrow('init boom');
    expect(received).toBe(boom);
  });
});
