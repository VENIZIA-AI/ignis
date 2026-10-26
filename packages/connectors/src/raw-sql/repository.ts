import type { IRepository } from '@venizia/ignis-kernel';
import { AbstractEntity } from '@venizia/ignis-kernel';
import type { TSchemaType } from '@venizia/ignis-kernel/repository';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { IRawSqlConnector, IRawSqlResult, TRawSqlQuery } from './common';
import type { BaseRawSqlDataSource } from './datasource';

/** A raw-SQL repository has a name but no model and no schema. */
export class RawSqlEntity extends AbstractEntity {
  getSchema<T = unknown>(_opts: { type: TSchemaType }): T {
    return {} as T;
  }
}

/**
 * A repository over a raw-SQL engine: it holds the datasource and reads `this.connector`, typed by
 * the connector the datasource was built with, so `this.connector.execute(...)` needs no cast. It
 * has no CRUD verbs - the subclass writes its own statements.
 *
 * Bind it with a datasource and no model, the same shape a remote repository has:
 * `@repository({ type: RepositoryTypes.REMOTE, dataSource: ReportDataSource })`.
 */
export abstract class BaseRawSqlRepository<TConnector extends IRawSqlConnector = IRawSqlConnector>
  extends BaseHelper
  implements IRepository
{
  dataSource: BaseRawSqlDataSource<AnyType, AnyType, TConnector>;
  entity: AbstractEntity;

  constructor(dataSource: BaseRawSqlDataSource<AnyType, AnyType, TConnector>) {
    super({ scope: new.target.name });

    this.dataSource = dataSource;
    this.entity = new RawSqlEntity({ name: new.target.name });
  }

  getEntity(): AbstractEntity {
    return this.entity;
  }

  /** The engine's connector, typed by the generic this repository was declared with. */
  get connector(): TConnector {
    return this.dataSource.getConnector();
  }

  /** `this.connector.execute(query)`, for a repository that runs a statement and reads the rows. */
  protected execute(query: TRawSqlQuery): Promise<IRawSqlResult> {
    return this.connector.execute(query);
  }
}
