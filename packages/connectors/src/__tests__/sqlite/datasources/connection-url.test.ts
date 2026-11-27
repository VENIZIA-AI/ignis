import { describe, expect, test } from 'bun:test';
import { SqliteDataSourceFixture } from './fixtures/sqlite-datasource.fixture';

/** The datasource with settings as untyped configuration can carry them. */
const withSettings = (settings: object): SqliteDataSourceFixture => {
  const dataSource = new SqliteDataSourceFixture();
  Reflect.set(dataSource, 'settings', settings);

  return dataSource;
};

describe('BaseSqliteDataSource.getConnectionString', () => {
  test('answers the url of the settings', () => {
    expect(new SqliteDataSourceFixture().getConnectionString()).toBe(':memory:');
  });

  for (const settings of [{}, { url: '' }, { url: 7 }, { url: { path: 'x' } }]) {
    test(`${JSON.stringify(settings)} is refused for want of a url`, () => {
      expect(() => withSettings(settings).getConnectionString()).toThrow(/No 'url' in settings/);
    });
  }
});
