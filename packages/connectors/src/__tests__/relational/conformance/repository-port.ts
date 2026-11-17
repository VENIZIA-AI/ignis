import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import type { DefaultRelationalRepository } from '@/relational/core/repositories/core/default';
import type {
  SoftDeletableRelationalRepository,
  TSoftDeletableTableSchema,
} from '@/relational/core/repositories/core/soft-deletable';
import type { ITransaction } from '@venizia/ignis-kernel';
import type { IConformanceOptions } from './repository-conformance';

/**
 * The verbs a shared case file calls, typed on the rows and inserts of the table the cases name and on the
 * transaction of the engine under test, so the engine's own repository is assignable to it without a cast.
 */
export type TRepositoryPort<
  Row extends TTableObject<TTableSchemaWithId>,
  Insert extends TTableInsert<TTableSchemaWithId>,
  Verb extends keyof DefaultRelationalRepository,
  TTransaction extends ITransaction = ITransaction,
> = Pick<
  DefaultRelationalRepository<TTableSchemaWithId, Row, Insert, IConformanceOptions<TTransaction>>,
  Verb
>;

/** {@link TRepositoryPort} for the soft-deletable repository, which adds the restore verbs. */
export type TSoftDeletablePort<
  Row extends TTableObject<TSoftDeletableTableSchema>,
  Insert extends TTableInsert<TSoftDeletableTableSchema>,
  Verb extends keyof SoftDeletableRelationalRepository,
  TTransaction extends ITransaction = ITransaction,
> = Pick<
  SoftDeletableRelationalRepository<
    TSoftDeletableTableSchema,
    Row,
    Insert,
    IConformanceOptions<TTransaction>
  >,
  Verb
>;
