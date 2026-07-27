import { describe, test, expect } from 'bun:test';
import { ApplicationError, HTTP } from '@venizia/ignis-helpers';

import { AbstractDataSource } from '@/base/datasources';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';

/** Fixture with no connector override - proves the neutral default capabilities. */
class StubDataSource extends AbstractDataSource<{}> {
  constructor() {
    super({ scope: 'StubDataSource' });

    this.name = 'stub-ds';
    this.settings = {};
  }

  configure(): void {
    // no-op fixture - never touches a real backend.
  }
}

/** Postgres fixture proving the connector-level capabilities override; no real pool needed. */
class StubPostgresDataSource extends BasePostgresDataSource<{}> {
  constructor() {
    super({ name: 'stub-postgres-ds', config: {} });
  }

  getConnectionString(): string {
    return 'postgres://stub';
  }

  configure(): void {
    // no-op fixture - only getCapabilities() is exercised here.
  }
}

describe('AbstractDataSource - capability probing / beginTransaction default (Decision 5)', () => {
  test('getCapabilities() defaults to { transactions: false } for a connector that does not override it', () => {
    const dataSource = new StubDataSource();
    expect(dataSource.getCapabilities()).toEqual({ transactions: false });
  });

  test('beginTransaction() rejects with the standardized NotSupported error (501, core.not_supported)', async () => {
    const dataSource = new StubDataSource();

    let caught: unknown;
    try {
      await dataSource.beginTransaction();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApplicationError);
    expect((caught as ApplicationError).statusCode).toBe(HTTP.ResultCodes.RS_5.NotImplemented);
    expect((caught as ApplicationError).normalized.code).toBe('core.not_supported');
  });
});

describe('BasePostgresDataSource (postgres) - overrides getCapabilities() to { transactions: true }', () => {
  test('getCapabilities() reports transactions: true', () => {
    const dataSource = new StubPostgresDataSource();
    expect(dataSource.getCapabilities()).toEqual({ transactions: true });
  });
});
