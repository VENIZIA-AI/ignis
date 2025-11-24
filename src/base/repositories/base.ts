// import { AnyObject } from '@/common/types';
// import { EntityClassType, IdType, TBaseIdEntity, TBaseTzEntity } from '../models';
// import {
//   DataObject,
//   ICount,
//   IFilter,
//   IPersistableRepository,
//   IRepository,
//   ITzRepository,
//   TWhere,
// } from './types';
//
// /**
//  * Base repository class
//  * Provides common CRUD operations for all repositories
//  */
// export abstract class BaseRepository<E extends TBaseIdEntity> implements IRepository {
//   protected entityClass: EntityClassType<E>;
//   protected dataSource: any;
//
//   constructor(entityClass: EntityClassType<E>, dataSource: any) {
//     this.entityClass = entityClass;
//     this.dataSource = dataSource;
//   }
//
//   /**
//    * Get entity name
//    */
//   get modelName(): string {
//     return this.entityClass.name;
//   }
//
//   /**
//    * Convert Filter to SQL WHERE clause
//    */
//   protected buildWhereClause(where?: TWhere<E>): AnyObject {
//     if (!where) {
//       return {};
//     }
//
//     const result: AnyObject = {};
//
//     for (const key in where) {
//       const value = where[key as keyof TWhere<E>];
//       switch (key) {
//         case 'and': {
//           result.$and = (value as TWhere<E>[]).map(w => this.buildWhereClause(w));
//           break;
//         }
//         case 'or': {
//           result.$or = (value as TWhere<E>[]).map(w => this.buildWhereClause(w));
//           break;
//         }
//         default: {
//           if (typeof value === 'object' && value !== null) {
//             result[key] = this.buildOperators(value);
//             break;
//           }
//
//           result[key] = value;
//           break;
//         }
//       }
//     }
//
//     return result;
//   }
//
//   protected buildOperators(operators: AnyObject): AnyObject {
//     const result: AnyObject = {};
//
//     for (const [op, value] of Object.entries(operators)) {
//       switch (op) {
//         case 'eq': {
//           return value;
//         }
//         case 'neq':
//         case 'ne': {
//           result.$ne = value;
//           break;
//         }
//         case 'gt': {
//           result.$gt = value;
//           break;
//         }
//         case 'gte': {
//           result.$gte = value;
//           break;
//         }
//         case 'lt': {
//           result.$lt = value;
//           break;
//         }
//         case 'lte': {
//           result.$lte = value;
//           break;
//         }
//         case 'like': {
//           result.$like = value;
//           break;
//         }
//         case 'ilike': {
//           result.$ilike = value;
//           break;
//         }
//         case 'regexp': {
//           result.$regexp = value;
//           break;
//         }
//         case 'in': {
//           result.$in = value;
//           break;
//         }
//         case 'nin': {
//           result.$nin = value;
//           break;
//         }
//         case 'between': {
//           result.$between = value;
//           break;
//         }
//         default:
//           result[op] = value;
//       }
//     }
//
//     return result;
//   }
//
//   /**
//    * Apply limit to filter
//    */
//   protected applyLimit(filter?: IFilter<E>, defaultLimit: number = 50): IFilter<E> {
//     return {
//       ...filter,
//       limit: filter?.limit || defaultLimit,
//     };
//   }
//
//   /**
//    * Abstract methods to be implemented by concrete repositories
//    */
//   abstract find(filter?: IFilter<E>, options?: AnyObject): Promise<E[]>;
//   abstract findById(id: IdType, filter?: IFilter<E>, options?: AnyObject): Promise<E>;
//   abstract findOne(filter?: IFilter<E>, options?: AnyObject): Promise<E | null>;
//   abstract count(where?: TWhere<E>, options?: AnyObject): Promise<ICount>;
//   abstract create(data: DataObject<E>, options?: AnyObject): Promise<E>;
//   abstract createAll(datum: DataObject<E>[], options?: AnyObject): Promise<E[]>;
//   abstract updateById(id: IdType, data: DataObject<E>, options?: AnyObject): Promise<void>;
//   abstract updateAll(data: DataObject<E>, where?: TWhere<E>, options?: AnyObject): Promise<ICount>;
//   abstract deleteById(id: IdType, options?: AnyObject): Promise<void>;
//   abstract existsWith(where?: TWhere<E>, options?: AnyObject): Promise<boolean>;
// }
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
