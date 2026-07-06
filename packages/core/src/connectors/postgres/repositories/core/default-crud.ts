import { TTableInsert, TTableObject, TTableSchemaWithId } from '@/connectors/postgres/models';
import { IExtraOptions } from '@/base/repositories/common';
import { PersistableRepository } from './persistable';
import { IDatabaseExtraOptions } from '../common';

/** Recommended base class for most repositories - full CRUD via PersistableRepository.
 * `ExtraOptions` defaults to `IDatabaseExtraOptions` so `options.transaction.connector` needs no cast. */
export class DefaultCRUDRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends IExtraOptions = IDatabaseExtraOptions,
> extends PersistableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {}
