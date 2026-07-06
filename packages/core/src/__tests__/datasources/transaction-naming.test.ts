import { describe, test, expect } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import { model, repository } from '@/base/metadata';
import { ITransaction } from '@/base/datasources';
import { AbstractRepository } from '@/base/repositories/core';
import { ICrudRepository, IExtraOptions } from '@/base/repositories/common';
import {
  BasePostgresDataSource,
  IDatabaseTransaction,
  IsolationLevels,
} from '@/connectors/postgres/datasources';
import { BasePostgresEntity, TTableInsert, TTableObject } from '@/connectors/postgres/models';
import { DefaultCRUDRepository, IDatabaseExtraOptions } from '@/connectors/postgres/repositories';

/**
 * Pins the transaction type naming: `ITransaction` is the neutral base (`Schema` generic unused),
 * postgres's `IDatabaseTransaction` narrows `IExtraOptions.transaction` via `IDatabaseExtraOptions`.
 * `tsc --noEmit` is the real check here, not just the handful of runtime assertions.
 */

const namingTable = pgTable('naming_check', {
  id: serial('id').primaryKey(),
  label: varchar('label', { length: 255 }),
});

type TNamingCheckObject = TTableObject<typeof namingTable>;
type TNamingCheckInsert = TTableInsert<typeof namingTable>;

@model({ type: 'entity' })
class NamingCheckEntity extends BasePostgresEntity {
  static override schema = namingTable;
}

class NamingCheckDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op fixture - never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

/**
 * `IDatabaseExtraOptions` is already the default `TOptions` for this tier, so spelling it out as
 * the 4th type argument here is redundant - purely for explicitness/documentation.
 */
@repository({ model: NamingCheckEntity, dataSource: NamingCheckDataSource })
class NamingCheckRepository extends DefaultCRUDRepository<
  typeof namingTable,
  TNamingCheckObject,
  TNamingCheckInsert,
  IDatabaseExtraOptions
> {
  /** (b) Proof: options?.transaction?.connector compiles with zero cast. */
  readConnectorFromOptions(opts?: { options?: IDatabaseExtraOptions }) {
    return opts?.options?.transaction?.connector;
  }
}

describe('Transaction naming (user-locked): ITransaction neutral / IDatabaseTransaction postgres', () => {
  test('(a) a rich IDatabaseTransaction is assignable to the neutral ITransaction<Record<string, unknown>> - phantom generic accepted', () => {
    const rdbTransactionMock: IDatabaseTransaction = {
      isActive: true,
      isolationLevel: IsolationLevels.READ_COMMITTED,
      connector: {} as IDatabaseTransaction['connector'],
      commit: async () => {},
      rollback: async () => {},
    };

    // `ITransaction<Schema>` never structurally uses `Schema`, so any connector-bearing
    // `IDatabaseTransaction` is assignable regardless of the annotated Schema argument.
    const annotate: ITransaction = rdbTransactionMock;

    expect(annotate.isActive).toBe(true);
  });

  test('(b) options?.transaction?.connector compiles for a DefaultCRUDRepository subclass opted into IDatabaseExtraOptions', () => {
    const dataSource = new NamingCheckDataSource({ name: 'naming-check-ds', config: {} });
    const repo = new NamingCheckRepository(dataSource);

    expect(repo.readConnectorFromOptions()).toBeUndefined();
    expect(repo.readConnectorFromOptions({ options: {} })).toBeUndefined();

    const rdbTransactionMock: IDatabaseTransaction = {
      isActive: true,
      isolationLevel: IsolationLevels.READ_COMMITTED,
      connector: {} as IDatabaseTransaction['connector'],
      commit: async () => {},
      rollback: async () => {},
    };

    expect(repo.readConnectorFromOptions({ options: { transaction: rdbTransactionMock } })).toBe(
      rdbTransactionMock.connector,
    );

    // Stays assignable to the neutral ICrudRepository interface...
    const asNeutralInterface: ICrudRepository<TNamingCheckObject, TNamingCheckInsert> = repo;
    expect(asNeutralInterface).toBe(repo);

    // ...and to the neutral AbstractRepository class (ControllerFactory's field type) - TS's
    // bivariant method-parameter checking lets the narrower IDatabaseExtraOptions satisfy it.
    const asAbstractClass: AbstractRepository<TNamingCheckObject, TNamingCheckInsert> = repo;
    expect(asAbstractClass).toBe(repo);
  });

  test('(c) the bare neutral ITransaction (no generic) still satisfies IExtraOptions.transaction - the typesense NotSupported path', () => {
    const bareTransaction: ITransaction = {
      isActive: false,
      commit: async () => {},
      rollback: async () => {},
    };

    const extraOptions: IExtraOptions = { transaction: bareTransaction };

    expect(extraOptions.transaction).toBe(bareTransaction);
  });
});
