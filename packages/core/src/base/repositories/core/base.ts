import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableSchemaWithId } from '@/base/models';
import { BaseHelper, TClass, TNullable } from '@vez/ignis-helpers';
import {
  DEFAULT_LIMIT,
  TDrizzleQueryOptions,
  IPersistableRepository,
  RepositoryOperationScopes,
  TCount,
  TFilter,
  TRelationConfig,
  TRepositoryOperationScope,
  TWhere,
} from '../common';
import { DrizzleFilterBuilder } from '../operators';

/**
 * Base repository class
 * Provides common CRUD operations for all repositories
 */
export abstract class AbstractRepository<
  EntitySchema extends TTableSchemaWithId,
  DataObject extends EntitySchema['$inferSelect'] = EntitySchema['$inferSelect'],
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
>
  extends BaseHelper
  implements IPersistableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions>
{
  protected operationScope: TRepositoryOperationScope;
  protected filterBuilder: DrizzleFilterBuilder;

  dataSource: IDataSource;
  entity: BaseEntity<EntitySchema>;
  relations: { [relationName: string]: TRelationConfig };
  defaultLimit: number;

  constructor(opts: {
    scope?: string;
    entityClass: TClass<BaseEntity<EntitySchema>>;
    relations: { [relationName: string]: TRelationConfig };
    dataSource: IDataSource;
    operationScope?: TRepositoryOperationScope;
    defaultLimit?: number;
  }) {
    super({ scope: opts?.scope ?? [opts.entityClass.name, 'Repository'].join('') });

    this.operationScope = opts.operationScope ?? RepositoryOperationScopes.READ_ONLY;
    this.filterBuilder = new DrizzleFilterBuilder();

    this.entity = new opts.entityClass();
    this.relations = opts.relations;
    this.dataSource = opts.dataSource;
    this.defaultLimit = opts.defaultLimit ?? DEFAULT_LIMIT;
  }

  // ---------------------------------------------------------------------------
  get connector() {
    return this.dataSource.connector;
  }

  getEntity(): BaseEntity<EntitySchema> {
    return this.entity;
  }

  getEntitySchema(): EntitySchema {
    return this.entity.schema;
  }

  getConnector(): IDataSource['connector'] {
    return this.connector;
  }

  buildQuery(opts: { filter: TFilter<DataObject> }): TDrizzleQueryOptions {
    return this.filterBuilder.build({
      tableName: this.entity.name,
      schema: this.entity.schema,
      relations: this.relations,
      filter: opts.filter,
    });
  }

  // ---------------------------------------------------------------------------
  abstract count(opts: { where: TWhere<DataObject>; options?: ExtraOptions }): Promise<TCount>;

  abstract existsWith(opts: {
    where: TWhere<DataObject>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  abstract find(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<DataObject[]>;
  abstract findOne(opts: {
    filter: TFilter<DataObject>;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;

  abstract findById(opts: {
    id: IdType;
    filter?: TFilter<DataObject> | undefined;
    options?: ExtraOptions;
  }): Promise<TNullable<DataObject>>;

  // ---------------------------------------------------------------------------
  abstract create(opts: {
    data: PersistObject;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }>;

  abstract createAll(opts: {
    data: Array<PersistObject>;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;

  // ---------------------------------------------------------------------------
  abstract updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }>;

  abstract updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;

  updateBy(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return this.updateAll(opts);
  }

  // ---------------------------------------------------------------------------
  abstract deleteById(opts: {
    id: IdType;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }>;

  abstract deleteAll(opts: {
    where: TWhere<DataObject>;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }>;

  deleteBy(opts: {
    where: TWhere<DataObject>;
    option?: (ExtraOptions | {}) & { shouldReturn?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return this.deleteAll(opts);
  }
}

//
// /**
//  * Default CRUD Repository
//  * Full implementation with Drizzle ORM
//  */
// export abstract class DefaultCrudRepository<E extends TBaseIdEntity, Relations extends object = {}>
//   extends BaseRepository<E>
//   implements IPersistableRepository<E>
// {
//   async find(_filter?: IFilter<E>, _options?: AnyObject): Promise<(E & Relations)[]> {
//     // To be implemented with Drizzle query builder
//     throw new Error('Method not implemented - connect Drizzle datasource');
//   }
//
//   async findById(id: IdType, filter?: IFilter<E>, options?: AnyObject): Promise<E & Relations> {
//     const result = await this.findOne(
//       { ...filter, where: { ...filter?.where, id } as any },
//       options,
//     );
//     if (!result) {
//       throw new Error(`Entity not found: ${this.modelName} with id ${id}`);
//     }
//     return result as E & Relations;
//   }
//
//   async findOne(filter?: IFilter<E>, options?: AnyObject): Promise<(E & Relations) | null> {
//     const results = await this.find({ ...filter, limit: 1 }, options);
//     return results[0] || null;
//   }
//
//   async count(_where?: TWhere<E>, _options?: AnyObject): Promise<ICount> {
//     // To be implemented with Drizzle
//     throw new Error('Method not implemented - connect Drizzle datasource');
//   }
//
//   async create(_data: DataObject<E>, _options?: AnyObject): Promise<E> {
//     // To be implemented with Drizzle
//     throw new Error('Method not implemented - connect Drizzle datasource');
//   }
//
//   async createAll(datum: DataObject<E>[], options?: AnyObject): Promise<E[]> {
//     return Promise.all(datum.map(data => this.create(data, options)));
//   }
//
//   async createWithReturn(data: DataObject<E>, options?: AnyObject): Promise<E> {
//     return this.create(data, options);
//   }
//
//   async updateById(_id: IdType, _data: DataObject<E>, _options?: AnyObject): Promise<void> {
//     // To be implemented with Drizzle
//     throw new Error('Method not implemented - connect Drizzle datasource');
//   }
//
//   async updateWithReturn(id: IdType, data: DataObject<E>, options?: AnyObject): Promise<E> {
//     await this.updateById(id, data, options);
//     return this.findById(id, undefined, options);
//   }
//
//   async updateAll(_data: DataObject<E>, _where?: TWhere<E>, _options?: AnyObject): Promise<ICount> {
//     // To be implemented with Drizzle
//     throw new Error('Method not implemented - connect Drizzle datasource');
//   }
//
//   async upsertWith(data: DataObject<E>, where: TWhere<E>, options?: AnyObject): Promise<E | null> {
//     const existing = await this.findOne({ where }, options);
//     if (existing) {
//       await this.updateById(existing.id, data, options);
//       return this.findById(existing.id, undefined, options);
//     }
//     return this.create(data, options);
//   }
//
//   async replaceById(id: IdType, data: DataObject<E>, options?: AnyObject): Promise<void> {
//     return this.updateById(id, data, options);
//   }
//
//   async deleteById(_id: IdType, _options?: AnyObject): Promise<void> {
//     // To be implemented with Drizzle
//     throw new Error('Method not implemented - connect Drizzle datasource');
//   }
//
//   async existsWith(where?: TWhere<E>, options?: AnyObject): Promise<boolean> {
//     const count = await this.count(where, options);
//     return count.count > 0;
//   }
//
//   async exists(id: IdType, options?: AnyObject): Promise<boolean> {
//     return this.existsWith({ id } as any, options);
//   }
// }
//
// /**
//  * Abstract Tz Repository
//  * Adds timestamp mixing functionality
//  */
// export abstract class AbstractTzRepository<E extends TBaseTzEntity, Relations extends object = {}>
//   extends DefaultCrudRepository<E, Relations>
//   implements ITzRepository<E>
// {
//   /**
//    * Mix timestamps into entity data
//    */
//   mixTimestamp(entity: DataObject<E>, options?: { newInstance: boolean }): DataObject<E> {
//     const now = new Date();
//
//     if (options?.newInstance) {
//       return {
//         ...entity,
//         createdAt: now,
//         modifiedAt: now,
//       };
//     }
//
//     return {
//       ...entity,
//       modifiedAt: now,
//     };
//   }
//
//   /**
//    * Mix user audit fields into entity data
//    */
//   mixUserAudit(
//     entity: DataObject<E>,
//     options?: { newInstance: boolean; authorId: IdType },
//   ): DataObject<E> {
//     if (!options?.authorId) {
//       return entity;
//     }
//
//     if (options.newInstance) {
//       return {
//         ...entity,
//         createdBy: options.authorId,
//         modifiedBy: options.authorId,
//       } as DataObject<E>;
//     }
//
//     return {
//       ...entity,
//       modifiedBy: options.authorId,
//     } as DataObject<E>;
//   }
//
//   override async create(data: DataObject<E>, options?: AnyObject): Promise<E> {
//     let enrichedData = this.mixTimestamp(data, { newInstance: true });
//
//     if (options?.authorId) {
//       enrichedData = this.mixUserAudit(enrichedData, {
//         newInstance: true,
//         authorId: options.authorId,
//       });
//     }
//
//     return super.create(enrichedData, options);
//   }
//
//   override async updateById(id: IdType, data: DataObject<E>, options?: AnyObject): Promise<void> {
//     let enrichedData = this.mixTimestamp(data, { newInstance: false });
//
//     if (options?.authorId) {
//       enrichedData = this.mixUserAudit(enrichedData, {
//         newInstance: false,
//         authorId: options.authorId,
//       });
//     }
//
//     return super.updateById(id, enrichedData, options);
//   }
//
//   override async updateAll(
//     data: DataObject<E>,
//     where?: TWhere<E>,
//     options?: AnyObject,
//   ): Promise<ICount> {
//     let enrichedData = this.mixTimestamp(data, { newInstance: false });
//
//     if (options?.authorId) {
//       enrichedData = this.mixUserAudit(enrichedData, {
//         newInstance: false,
//         authorId: options.authorId,
//       });
//     }
//
//     return super.updateAll(enrichedData, where, options);
//   }
// }
