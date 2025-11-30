import { IDataSource } from '@/base/datasources';
import { BaseHelper } from '@/base/helpers';
import { BaseEntity, IdType, TTableObject, TTableSchemaWithId } from '@/base/models';
import { IClass, TNullable } from '@/common/types';
import {
  IRepository,
  RepositoryOperationScopes,
  TCount,
  TFilter,
  TRepositoryOperationScope,
  TWhere,
} from '../common';
import { DrizzleFilterBuilder } from '../operators';

/**
 * Base repository class
 * Provides common CRUD operations for all repositories
 */
export abstract class AbstractRepository<
  EntitySchema extends TTableSchemaWithId = any,
  ExtraOptions extends object = {},
>
  extends BaseHelper
  implements IRepository<EntitySchema>
{
  protected operationScope: TRepositoryOperationScope;
  protected filterBuilder: DrizzleFilterBuilder<EntitySchema>;

  entity: BaseEntity<EntitySchema>;
  dataSource: IDataSource;

  constructor(opts: {
    scope?: string;
    entityClass: IClass<BaseEntity<EntitySchema>>;
    dataSource: IDataSource;
    operationScope?: TRepositoryOperationScope;
  }) {
    super({ scope: opts?.scope ?? [opts.entityClass.name, 'Repository'].join('') });

    this.operationScope = opts.operationScope ?? RepositoryOperationScopes.READ_ONLY;
    this.filterBuilder = new DrizzleFilterBuilder<EntitySchema>();

    this.entity = new opts.entityClass();
    this.dataSource = opts.dataSource;
  }

  get modelName(): string {
    return this.entity.name;
  }

  get connector() {
    return this.dataSource.connector;
  }

  // -----------------------------------------------------------------------------
  abstract count(opts: {
    where: TWhere<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<TCount>;
  abstract existsWith(opts: {
    where: TWhere<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<boolean>;

  // -----------------------------------------------------------------------------
  abstract find(opts: {
    filter: TFilter<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<Array<BaseEntity<EntitySchema>>>;
  abstract findOne(opts: {
    filter: TFilter<TTableObject<EntitySchema>>;
    options?: ExtraOptions;
  }): Promise<TNullable<BaseEntity<EntitySchema>>>;
  abstract findById(opts: {
    id: IdType;
    options?: ExtraOptions;
  }): Promise<TNullable<BaseEntity<EntitySchema>>>;

  // -----------------------------------------------------------------------------
  abstract create(opts: {
    data: Partial<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<BaseEntity<EntitySchema>>>;
  abstract createAll(opts: {
    data: Partial<BaseEntity<EntitySchema>>[];
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TNullable<Array<BaseEntity<EntitySchema>>>>;

  // -----------------------------------------------------------------------------
  abstract updateById(opts: {
    id: IdType;
    data: Partial<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>>;
  abstract updateAll(opts: {
    data: Partial<BaseEntity<EntitySchema>>;
    where?: TWhere<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<Array<BaseEntity<EntitySchema>>>>;

  // -----------------------------------------------------------------------------
  abstract deleteById(opts: {
    id: IdType;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>>;
  abstract deleteAll(opts: {
    where?: TWhere<BaseEntity<EntitySchema>>;
    options?: ExtraOptions & { returning: boolean };
  }): Promise<TCount & TNullable<BaseEntity<EntitySchema>>>;
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
