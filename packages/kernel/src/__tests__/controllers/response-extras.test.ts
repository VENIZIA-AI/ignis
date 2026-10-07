import { ResponseExtras } from '@/base/controllers/rest/extras';
import type { TResponseExtra } from '@/base/controllers/rest/extras';
import { describe, expect, test } from 'bun:test';

const offered: Record<string, TResponseExtra> = {
  summary: () => 'summary',
  counts: { isDefault: true, compute: () => 'counts' },
  facets: { keys: ['status', 'category', 'tag'], compute: ({ keys }) => keys },
};

const resolve = (header: string) =>
  ResponseExtras.resolve({ requested: ResponseExtras.parse({ header }), offered });

describe('parsing x-request-extra', () => {
  test('plain, switched-off and grouped entries, whitespace and empty entries ignored', () => {
    expect(
      ResponseExtras.parse({ header: ' summary , -counts,, facets( status , tag ) ' }),
    ).toEqual([
      { name: 'summary', isExcluded: false, keys: undefined },
      { name: 'counts', isExcluded: true, keys: undefined },
      { name: 'facets', isExcluded: false, keys: ['status', 'tag'] },
    ]);
  });

  test('no header is no entry', () => {
    expect(ResponseExtras.parse({ header: undefined })).toEqual([]);
    expect(ResponseExtras.parse({ header: '  ' })).toEqual([]);
  });

  for (const malformed of ['facets(status', 'a b', 'facets((x))', '1abc', 'facets(st atus)', '*']) {
    test(`'${malformed}' is a 400, never evaluated`, () => {
      expect(() => ResponseExtras.parse({ header: malformed })).toThrow(/x-request-extra/);
    });
  }
});

describe('resolving against what a route offers', () => {
  test('the default runs unasked; asked extras join it', () => {
    expect([...resolve('summary').keys()]).toEqual(['summary', 'counts']);
  });

  test('a group receives the keys asked for, de-duplicated in order', () => {
    expect(resolve('facets(tag,status),facets(tag)').get('facets')).toEqual(['tag', 'status']);
  });

  test('-name switches a default off, -* every default', () => {
    expect([...resolve('-counts').keys()]).toEqual([]);
    expect([...resolve('-*,summary').keys()]).toEqual(['summary']);
  });

  const rejected: Array<[string, RegExp]> = [
    ['nope', /Unknown extra requested: nope \| This route offers: summary, counts, facets/],
    ['-nope', /Unknown extra requested: nope/],
    ['facets', /Extra 'facets' needs keys: status, category, tag/],
    ['facets()', /Extra 'facets' needs keys/],
    ['facets(price)', /Unknown key for extra 'facets': price \| It offers: status, category, tag/],
    ['summary(x)', /Extra 'summary' takes no keys/],
  ];

  for (const [header, message] of rejected) {
    test(`'${header}' is a 400`, () => {
      expect(() => resolve(header)).toThrow(message);
    });
  }
});

describe('computing the plan', () => {
  test('each value under its name, the group given its keys', async () => {
    const plan = resolve('facets(status),summary');

    expect(await ResponseExtras.compute({ plan, offered })).toEqual({
      facets: ['status'],
      summary: 'summary',
      counts: 'counts',
    });
  });

  test('an extra that throws synchronously beside one already running rejects once, nothing left unhandled', async () => {
    const throwing: Record<string, TResponseExtra> = {
      slow: async () => {
        await Bun.sleep(5);
        throw new Error('slow failed');
      },
      fast: () => {
        throw new Error('fast failed');
      },
    };
    const unhandled: Array<unknown> = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      const plan = ResponseExtras.resolve({
        requested: ResponseExtras.parse({ header: 'slow,fast' }),
        offered: throwing,
      });
      const failure = await ResponseExtras.compute({ plan, offered: throwing }).catch(
        (error: Error) => error.message,
      );

      await Bun.sleep(20);
      expect(failure).toBe('fast failed');
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('review cases', () => {
  test('a group never runs unasked, even declared as a default at runtime', () => {
    const mislabelled: Record<string, TResponseExtra> = {};
    Reflect.set(mislabelled, 'group', { keys: ['a'], isDefault: true, compute: () => 'ran' });

    expect([...ResponseExtras.resolve({ requested: [], offered: mislabelled }).keys()]).toEqual([]);
  });

  test('switching a default off with keys is a 400', () => {
    expect(() => resolve('-counts(status)')).toThrow(/Switching 'counts' off takes no keys/);
  });
});
