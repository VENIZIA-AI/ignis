import { describe, expect, test } from 'bun:test';
import { ReleaseRegistry } from '../release-registry';

interface IAnswer {
  status: number;
  body?: unknown;
}

/** A registry that answers from a table of url -> answer; anything else is a 404. Records what it was asked. */
const fakeFetch = (answers: Record<string, IAnswer | Error>) => {
  const asked: Array<{ url: string; method: string }> = [];
  const fetchFn = async (url: string, init?: { method?: string }) => {
    asked.push({ url, method: init?.method ?? 'GET' });
    const answer = answers[`${init?.method ?? 'GET'} ${url}`] ?? { status: 404 };
    if (answer instanceof Error) {
      throw answer;
    }

    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body,
    };
  };

  return { fetchFn, asked };
};

const PACKUMENT = 'GET https://registry.npmjs.org/@venizia/ignis-kernel';
const TARBALL = 'HEAD https://registry.npmjs.org/@venizia/ignis-kernel/-/ignis-kernel-0.4.6.tgz';

describe('ReleaseRegistry.isPublished', () => {
  test('is true when the packument lists the version', async () => {
    const { fetchFn } = fakeFetch({
      [PACKUMENT]: { status: 200, body: { versions: { '0.4.6': {} } } },
    });

    expect(
      await ReleaseRegistry.isPublished({
        packageName: '@venizia/ignis-kernel',
        version: '0.4.6',
        fetchFn,
      }),
    ).toBe(true);
  });

  test('is true when the packument lags but the tarball answers 200 (the tarball is the authority)', async () => {
    const { fetchFn } = fakeFetch({
      [PACKUMENT]: { status: 200, body: { versions: { '0.4.5': {} } } },
      [TARBALL]: { status: 200 },
    });

    expect(
      await ReleaseRegistry.isPublished({
        packageName: '@venizia/ignis-kernel',
        version: '0.4.6',
        fetchFn,
      }),
    ).toBe(true);
  });

  test('is false when neither the packument nor the tarball has it', async () => {
    const { fetchFn } = fakeFetch({
      [PACKUMENT]: { status: 200, body: { versions: { '0.4.5': {} } } },
    });

    expect(
      await ReleaseRegistry.isPublished({
        packageName: '@venizia/ignis-kernel',
        version: '0.4.6',
        fetchFn,
      }),
    ).toBe(false);
  });

  test('a network error is not "found": it answers false, and the duplicate publish is then refused by npm', async () => {
    const { fetchFn } = fakeFetch({
      [PACKUMENT]: new Error('socket hang up'),
      [TARBALL]: new Error('socket hang up'),
    });

    expect(
      await ReleaseRegistry.isPublished({
        packageName: '@venizia/ignis-kernel',
        version: '0.4.6',
        fetchFn,
      }),
    ).toBe(false);
  });

  test('asks fresh: the packument request disables the cache', async () => {
    let init: { cache?: string } | undefined;
    let calls = 0;
    const fetchFn = async (_url: string, options?: typeof init) => {
      calls += 1;
      init = calls === 1 ? options : init;
      return { ok: false, status: 404, json: async () => ({}) };
    };

    await ReleaseRegistry.isPublished({
      packageName: '@venizia/ignis-kernel',
      version: '0.4.6',
      fetchFn,
    });

    expect(init?.cache).toBe('no-store');
  });
});

describe('ReleaseRegistry.findMissing', () => {
  test('passes a sibling the packument has not listed yet when its tarball answers 200', async () => {
    const { fetchFn } = fakeFetch({
      [PACKUMENT]: { status: 200, body: { versions: { '0.4.5': {} } } },
      [TARBALL]: { status: 200 },
    });

    const missing = await ReleaseRegistry.findMissing({
      dependencies: { '@venizia/ignis-kernel': '0.4.6' },
      fetchFn,
    });

    expect(missing).toEqual([]);
  });

  test('passes a third-party range that some published version satisfies', async () => {
    const { fetchFn } = fakeFetch({
      'GET https://registry.npmjs.org/zod': { status: 200, body: { versions: { '4.1.0': {} } } },
    });

    expect(await ReleaseRegistry.findMissing({ dependencies: { zod: '^4.0.0' }, fetchFn })).toEqual(
      [],
    );
  });

  test('names a range that no published version satisfies', async () => {
    const { fetchFn } = fakeFetch({
      'GET https://registry.npmjs.org/zod': { status: 200, body: { versions: { '3.0.0': {} } } },
    });

    const missing = await ReleaseRegistry.findMissing({ dependencies: { zod: '^4.0.0' }, fetchFn });

    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('zod@^4.0.0');
  });

  test('names a package the registry does not know, and one it could not reach', async () => {
    const { fetchFn } = fakeFetch({
      'GET https://registry.npmjs.org/ghost': { status: 404 },
      'GET https://registry.npmjs.org/flaky': new Error('socket hang up'),
    });

    const missing = await ReleaseRegistry.findMissing({
      dependencies: { ghost: '^1.0.0', flaky: '^1.0.0' },
      fetchFn,
    });

    expect(missing).toHaveLength(2);
    expect(missing.join('\n')).toContain('ghost@^1.0.0');
    expect(missing.join('\n')).toContain('could not reach');
  });
});
