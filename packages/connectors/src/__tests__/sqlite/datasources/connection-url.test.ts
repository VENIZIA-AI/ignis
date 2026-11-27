import { describe, expect, test } from 'bun:test';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources/base';

/** `getConnectionString` run on settings as untyped configuration can carry them. */
const read = (settings: unknown): unknown =>
  Reflect.apply(BaseSqliteDataSource.prototype.getConnectionString, { settings }, []);

describe('BaseSqliteDataSource.getConnectionString', () => {
  test('answers the url of the settings', () => {
    expect(read({ url: ':memory:' })).toBe(':memory:');
  });

  for (const settings of [{}, { url: '' }, { url: 7 }, { url: { path: 'x' } }]) {
    test(`${JSON.stringify(settings)} is refused for want of a url`, () => {
      expect(() => read(settings)).toThrow(/No 'url' in settings/);
    });
  }
});
