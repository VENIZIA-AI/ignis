import { PgColumnBuilderBase } from 'drizzle-orm/pg-core';
import { Entity } from './base';

// ----------------------------------------------------------------------------------------------------------------------------------------
export type NumberIdType = number;
export type StringIdType = string;
export type IdType = string | number;
export type TColumnDefinition = PgColumnBuilderBase;
export type TColumns = { [field: string | symbol]: TColumnDefinition };
export type TEnricher<O extends object = any> = (baseColumns: TColumns, opts: O) => TColumns;

// ----------------------------------------------------------------------------------------------------------------------------------------
// Entity Interfaces
// ----------------------------------------------------------------------------------------------------------------------------------------
export interface IEntity {
  id: IdType;
}

export type EntityClassType<T extends Entity> = typeof Entity & {
  prototype: T & { id?: IdType };
};

export type EntityRelationType = Record<string, any>;
