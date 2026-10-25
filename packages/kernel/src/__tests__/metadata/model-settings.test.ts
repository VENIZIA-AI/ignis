import { warnDeprecatedModelSettings } from '@/base/applications/deprecations';
import { model } from '@/base/metadata';
import { normalizeModelSettings } from '@/base/metadata/model-settings';
import { AbstractEntity } from '@/base/models';
import { ScopeFilters } from '@/base/repositories';
import { MetadataRegistry } from '@/helpers/inversion';
import { afterEach, describe, expect, test } from 'bun:test';

const resolve = () => ({ merchantId: 'm-a' });
const normalize = (settings: Parameters<typeof normalizeModelSettings>[0]['settings']) => {
  return normalizeModelSettings({ model: 'Product', settings });
};

describe('normalizeModelSettings - each old key moves to the new shape', () => {
  test('defaultFilter becomes query.filter', () => {
    const { settings, deprecated } = normalize({ defaultFilter: { where: { isDeleted: false } } });

    expect(settings).toEqual({ query: { filter: { where: { isDeleted: false } } } });
    expect(deprecated).toEqual([{ key: 'defaultFilter', use: 'query.filter' }]);
  });

  test('defaultLimit becomes query.limit.default and maxLimit becomes query.limit.max', () => {
    const { settings, deprecated } = normalize({ defaultLimit: 20, maxLimit: 200 });

    expect(settings).toEqual({ query: { limit: { default: 20, max: 200 } } });
    expect(deprecated).toEqual([
      { key: 'defaultLimit', use: 'query.limit.default' },
      { key: 'maxLimit', use: 'query.limit.max' },
    ]);
  });

  test('scopeFilter becomes access, with writeGuard as write.mode and sharedRows as write.sharedRows', () => {
    const { settings, deprecated } = normalize({
      scopeFilter: {
        resolve,
        onMissing: 'allow',
        columns: ['merchantId'],
        writeGuard: 'assign',
        sharedRows: true,
      },
    });

    expect(settings).toEqual({
      access: {
        resolve,
        onMissing: 'allow',
        columns: ['merchantId'],
        write: { mode: 'assign', sharedRows: true },
      },
    });
    expect(deprecated.map((entry) => entry.key)).toEqual([
      'scopeFilter',
      'scopeFilter.writeGuard',
      'scopeFilter.sharedRows',
    ]);
    expect(deprecated.map((entry) => entry.use)).toEqual([
      'access',
      'access.write.mode',
      'access.write.sharedRows',
    ]);
  });

  test('a scopeFilter without writeGuard or sharedRows warns only for scopeFilter and has no write', () => {
    const { settings, deprecated } = normalize({ scopeFilter: { resolve } });

    expect(settings).toEqual({ access: { resolve } });
    expect(deprecated).toEqual([{ key: 'scopeFilter', use: 'access' }]);
  });

  test('every old key together, with hiddenProperties and authorize untouched', () => {
    const { settings, deprecated } = normalize({
      hiddenProperties: ['costPrice'],
      authorize: { principal: 'Product' },
      defaultFilter: { where: { isDeleted: false } },
      defaultLimit: 10,
      maxLimit: 100,
      scopeFilter: { resolve },
    });

    expect(settings).toEqual({
      hiddenProperties: ['costPrice'],
      authorize: { principal: 'Product' },
      query: { filter: { where: { isDeleted: false } }, limit: { default: 10, max: 100 } },
      access: { resolve },
    });
    expect(deprecated).toHaveLength(4);
  });

  test('no deprecated key: the settings come back equal and nothing is reported', () => {
    const input = {
      hiddenProperties: ['costPrice'],
      query: { limit: { max: 50 } },
      access: { resolve, write: { mode: 'reject' as const } },
    };
    const { settings, deprecated } = normalize(input);

    expect(settings).toEqual(input);
    expect(deprecated).toEqual([]);
  });

  test('undefined settings stay undefined', () => {
    expect(normalize(undefined)).toEqual({ settings: undefined, deprecated: [] });
  });
});

describe('normalizeModelSettings - merging into an existing query or access', () => {
  test('an old limit joins an existing query.filter, an old filter joins an existing query.limit', () => {
    const first = normalize({ query: { filter: { where: { a: 1 } } }, defaultLimit: 5 });
    const second = normalize({ query: { limit: { max: 9 } }, defaultFilter: { where: { a: 1 } } });

    expect(first.settings?.query).toEqual({ filter: { where: { a: 1 } }, limit: { default: 5 } });
    expect(second.settings?.query).toEqual({ limit: { max: 9 }, filter: { where: { a: 1 } } });
  });

  test('defaultLimit and maxLimit land side by side in query.limit', () => {
    const { settings } = normalize({ query: { limit: {} }, defaultLimit: 5, maxLimit: 6 });

    expect(settings?.query?.limit).toEqual({ default: 5, max: 6 });
  });
});

describe('normalizeModelSettings - an old key with the key that replaces it is an error', () => {
  test.each([
    ['defaultFilter', { defaultFilter: {}, query: { filter: {} } }, /defaultFilter.*query\.filter/],
    [
      'defaultLimit',
      { defaultLimit: 5, query: { limit: { default: 6 } } },
      /defaultLimit.*query\.limit\.default/,
    ],
    ['maxLimit', { maxLimit: 5, query: { limit: { max: 6 } } }, /maxLimit.*query\.limit\.max/],
    ['scopeFilter', { scopeFilter: { resolve }, access: { resolve } }, /scopeFilter.*access/],
  ])('%s', (_name, settings, pattern) => {
    expect(() => normalize(settings as never)).toThrow(pattern);
  });

  test('the message names the model and says which key to keep', () => {
    expect(() => normalize({ defaultLimit: 5, query: { limit: { default: 6 } } })).toThrow(
      /\[model\]\[Product\].*keep query\.limit\.default and remove defaultLimit/,
    );
  });

  test('different old and new keys do not conflict: defaultLimit with query.limit.max', () => {
    expect(() => normalize({ defaultLimit: 5, query: { limit: { max: 9 } } })).not.toThrow();
  });
});

describe('@model - normalises at decoration and records what to warn about', () => {
  const registry = MetadataRegistry.getInstance();

  afterEach(() => {
    registry.getAllModels().clear();
  });

  test('the registry holds only the new shape, plus the list of old keys in use', () => {
    @model({
      type: 'entity',
      settings: { defaultFilter: { where: { isDeleted: false } }, maxLimit: 40 },
    })
    class OldShapeProduct extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    const entry = registry.getModelMetadata({ target: OldShapeProduct });

    expect(entry?.settings).toEqual({
      query: { filter: { where: { isDeleted: false } }, limit: { max: 40 } },
    });
    expect(entry?.settings && 'defaultFilter' in entry.settings).toBe(false);
    expect(entry?.deprecatedSettings?.map((item) => item.key)).toEqual([
      'defaultFilter',
      'maxLimit',
    ]);
  });

  test('a model on the new shape records nothing to warn about', () => {
    @model({ type: 'entity', settings: { query: { limit: { default: 3 } } } })
    class NewShapeProduct extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }

    expect(
      registry.getModelMetadata({ target: NewShapeProduct })?.deprecatedSettings,
    ).toBeUndefined();
  });

  test('the limits are still validated, under the new names', () => {
    expect(() => {
      @model({ type: 'entity', settings: { defaultLimit: 0 } })
      class BadDefault extends AbstractEntity {
        getSchema<T>(): T {
          return {} as T;
        }
      }
      return BadDefault;
    }).toThrow(/query\.limit\.default/);

    expect(() => {
      @model({ type: 'entity', settings: { query: { limit: { max: 1.5 } } } })
      class BadMax extends AbstractEntity {
        getSchema<T>(): T {
          return {} as T;
        }
      }
      return BadMax;
    }).toThrow(/query\.limit\.max/);
  });

  test('an old key with its new key throws at decoration', () => {
    expect(() => {
      @model({
        type: 'entity',
        settings: {
          scopeFilter: { resolve: () => ScopeFilters.UNRESTRICTED },
          access: { resolve },
        },
      })
      class Conflicting extends AbstractEntity {
        getSchema<T>(): T {
          return {} as T;
        }
      }
      return Conflicting;
    }).toThrow(/scopeFilter and settings\.access are both set/);
  });
});

describe('warnDeprecatedModelSettings', () => {
  const registry = MetadataRegistry.getInstance();

  afterEach(() => {
    registry.getAllModels().clear();
  });

  test('prints one warning per old key, naming the model, the old key, the new key and 0.4.3', () => {
    @model({
      type: 'entity',
      settings: { defaultLimit: 10, scopeFilter: { resolve, writeGuard: 'assign' } },
    })
    class WarnedProduct extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }
    expect(WarnedProduct).toBeDefined();

    const lines: string[] = [];
    const logger = {
      warn: (template: string, ...args: unknown[]) => {
        lines.push(args.reduce<string>((text, arg) => text.replace('%s', String(arg)), template));
      },
    };

    const count = warnDeprecatedModelSettings({ logger: logger as never });

    expect(count).toBe(3);
    expect(lines).toEqual([
      '[deprecated] model WarnedProduct uses settings.defaultLimit | use settings.query.limit.default instead | removed in 0.4.3',
      '[deprecated] model WarnedProduct uses settings.scopeFilter | use settings.access instead | removed in 0.4.3',
      '[deprecated] model WarnedProduct uses settings.scopeFilter.writeGuard | use settings.access.write.mode instead | removed in 0.4.3',
    ]);
  });

  test('prints nothing for models on the new shape', () => {
    @model({ type: 'entity', settings: { query: { limit: { default: 10 } }, access: { resolve } } })
    class CleanProduct extends AbstractEntity {
      getSchema<T>(): T {
        return {} as T;
      }
    }
    expect(CleanProduct).toBeDefined();

    const logger = { warn: () => expect.unreachable('no warning expected') };

    expect(warnDeprecatedModelSettings({ logger: logger as never })).toBe(0);
  });
});
