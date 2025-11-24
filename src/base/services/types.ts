// import type { Context as HonoContext } from 'hono';
// import { EntityRelationType, IdType, TBaseTzEntity } from '../models';
// import { AbstractTzRepository, ICount, IFilter, TWhere } from '../repositories';
//
// ----------------------------------------------------------------------------------------------------------------------------------------
// Service Interfaces
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IService {}
//
// export interface ICrudMethodOptions {
//   currentUser: {
//     userId: IdType;
//     roles: Array<{ id: IdType; identifier: string; priority: number }>;
//     [extra: string | symbol]: any;
//   } | null;
//
//   requestContext: HonoContext;
//
//   [extra: symbol | string]: any;
// }
//
// export interface ICrudService<E extends TBaseTzEntity> extends IService {
//   repository: AbstractTzRepository<E, EntityRelationType>;
//
//   // Read
//   find(filter: IFilter<E>, options: ICrudMethodOptions): Promise<Array<E & EntityRelationType>>;
//   findById(
//     id: IdType,
//     filter: IFilter<E>,
//     options: ICrudMethodOptions,
//   ): Promise<E & EntityRelationType>;
//   findOne(
//     filter: IFilter<E>,
//     options: ICrudMethodOptions,
//   ): Promise<(E & EntityRelationType) | null>;
//   count(where: TWhere<E>, options: ICrudMethodOptions): Promise<ICount>;
//
//   // Create, Update, Delete
//   create(data: Omit<E, 'id'>, options: ICrudMethodOptions): Promise<E>;
//   updateAll(data: Partial<E>, where: TWhere<E>, options: ICrudMethodOptions): Promise<ICount>;
//   updateWithReturn(id: IdType, data: Partial<E>, options: ICrudMethodOptions): Promise<E>;
//   replaceById(id: IdType, data: E, options: ICrudMethodOptions): Promise<E>;
//   deleteById(id: IdType, options: ICrudMethodOptions): Promise<{ id: IdType }>;
// }
