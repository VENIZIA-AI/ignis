import { describe, test, expect } from 'bun:test';
import { AbstractDataSource, DataSourceDrivers } from '@/base/datasources';
import {
  AbstractPostgresDataSource,
  BasePostgresDataSource,
} from '@/connectors/postgres/datasources';

describe('DataSource root split', () => {
  test('BasePostgresDataSource remains an AbstractDataSource through the SQL branch', () => {
    expect(BasePostgresDataSource.prototype instanceof AbstractPostgresDataSource).toBe(true);
    expect(BasePostgresDataSource.prototype instanceof AbstractDataSource).toBe(true);
    expect(AbstractPostgresDataSource.prototype instanceof AbstractDataSource).toBe(true);
  });

  test('the neutral root does not carry SQL-specific members', () => {
    expect('getConnector' in AbstractDataSource.prototype).toBe(false);
    expect('getConnectionString' in AbstractDataSource.prototype).toBe(false);
  });

  test('the neutral root DOES carry beginTransaction/getCapabilities - a NotSupported-by-default capability, not a SQL member', () => {
    expect('beginTransaction' in AbstractDataSource.prototype).toBe(true);
    expect('getCapabilities' in AbstractDataSource.prototype).toBe(true);
    expect('beginTransaction' in BasePostgresDataSource.prototype).toBe(true);
  });

  /**
   * Every driver IGNIS actually ships must be nameable through the const class. A missing member
   * forces the app to write a bare string in `@datasource({ driver })` - losing autocomplete - and
   * makes `isValid()` answer false about a driver that plainly exists.
   */
  test('DataSourceDrivers names every driver the framework ships', () => {
    const shipped = [
      DataSourceDrivers.NODE_POSTGRES, // connectors/postgres/drivers/node-postgres
      DataSourceDrivers.POSTGRES_JS, // connectors/postgres/drivers/postgres-js
      DataSourceDrivers.TYPESENSE, // connectors/typesense
      DataSourceDrivers.MEILISEARCH, // connectors/meilisearch
    ];

    expect(shipped).toEqual(['node-postgres', 'postgres-js', 'typesense', 'meilisearch']);

    for (const driver of shipped) {
      expect(DataSourceDrivers.isValid(driver)).toBe(true);
    }

    expect(DataSourceDrivers.isValid('mongodb')).toBe(false);
  });
});
