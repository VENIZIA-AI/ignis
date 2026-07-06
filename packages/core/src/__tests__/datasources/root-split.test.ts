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

  test('DataSourceDrivers gains typesense', () => {
    expect(DataSourceDrivers.TYPESENSE).toBe('typesense');
    expect(DataSourceDrivers.isValid('typesense')).toBe(true);
  });
});
