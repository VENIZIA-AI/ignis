import { describe, expect, test } from 'bun:test';
import { ReleaseTarballs } from '../release-tarballs';

/** A registry that answers 404 `misses` times for a URL, then 200. */
const fakeRegistry = (opts: { misses: Record<string, number> }) => {
  const asked: string[] = [];
  const fetchFn = async (url: string) => {
    asked.push(url);
    const left = opts.misses[url] ?? 0;
    if (left > 0) {
      opts.misses[url] = left - 1;
      return { ok: false, status: 404 };
    }

    return { ok: true, status: 200 };
  };

  return { asked, fetchFn };
};

const noSleep = async () => {};

describe('ReleaseTarballs.getUrl', () => {
  test('names the file by the unscoped package name', () => {
    expect(ReleaseTarballs.getUrl({ packageName: '@venizia/ignis-kernel', version: '0.4.5' })).toBe(
      'https://registry.npmjs.org/@venizia/ignis-kernel/-/ignis-kernel-0.4.5.tgz',
    );
    expect(ReleaseTarballs.getUrl({ packageName: '@venizia/ignis', version: '0.4.5' })).toBe(
      'https://registry.npmjs.org/@venizia/ignis/-/ignis-0.4.5.tgz',
    );
  });
});

describe('ReleaseTarballs.waitFor', () => {
  test('keeps asking through two 404s and returns on the first 200', async () => {
    const url = ReleaseTarballs.getUrl({ packageName: '@venizia/ignis', version: '0.4.5' });
    const registry = fakeRegistry({ misses: { [url]: 2 } });

    await ReleaseTarballs.waitFor({
      packageName: '@venizia/ignis',
      version: '0.4.5',
      fetchFn: registry.fetchFn,
      sleepFn: noSleep,
    });

    expect(registry.asked).toEqual([url, url, url]);
  });

  test('a dropped connection means "not yet", not a failure', async () => {
    let calls = 0;

    await ReleaseTarballs.waitFor({
      packageName: '@venizia/ignis',
      version: '0.4.5',
      fetchFn: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('socket closed');
        }

        return { ok: true, status: 200 };
      },
      sleepFn: noSleep,
    });

    expect(calls).toBe(2);
  });

  test('gives up after the attempts and names the package and the version', async () => {
    const error = await ReleaseTarballs.waitFor({
      packageName: '@venizia/ignis',
      version: '0.4.5',
      fetchFn: async () => ({ ok: false, status: 404 }),
      sleepFn: noSleep,
      attempts: 4,
    }).catch((caught: unknown) => caught);

    expect(String(error)).toContain('@venizia/ignis@0.4.5');
    expect(String(error)).toContain('404');
  });
});

describe('ReleaseTarballs.waitForAll', () => {
  test('resolves only when every package of the train answers 200', async () => {
    const slow = ReleaseTarballs.getUrl({ packageName: '@venizia/ignis-kernel', version: '0.4.5' });
    const registry = fakeRegistry({ misses: { [slow]: 3 } });

    await ReleaseTarballs.waitForAll({
      packages: [
        { packageName: '@venizia/ignis-helpers', version: '0.4.5' },
        { packageName: '@venizia/ignis-kernel', version: '0.4.5' },
        { packageName: '@venizia/ignis', version: '0.4.5' },
      ],
      fetchFn: registry.fetchFn,
      sleepFn: noSleep,
    });

    expect(registry.asked.filter((url) => url === slow)).toHaveLength(4);
    expect(registry.asked).toHaveLength(6);
  });

  test('rejects when one package never answers, naming it', async () => {
    const error = await ReleaseTarballs.waitForAll({
      packages: [
        { packageName: '@venizia/ignis-helpers', version: '0.4.5' },
        { packageName: '@venizia/ignis', version: '0.4.5' },
      ],
      fetchFn: async (url) =>
        url.includes('/ignis-0.4.5.tgz') ? { ok: false, status: 404 } : { ok: true, status: 200 },
      sleepFn: noSleep,
      attempts: 3,
    }).catch((caught: unknown) => caught);

    expect(String(error)).toContain('@venizia/ignis@0.4.5');
    expect(String(error)).not.toContain('ignis-helpers@');
  });
});
