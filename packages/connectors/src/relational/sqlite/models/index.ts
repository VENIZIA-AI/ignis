export * from './base';
export * from './common';
export * from './enrichers';

export { ModelFactory } from '@/relational/core/models/factory';
export type { TDefinedEntityClass } from '@/relational/core/models/factory';
export { many, one, toRelationConfigs } from '@/relational/core/models/relations';
export type {
  IDefinedEntity,
  IManyRelation,
  TEntityObject,
  IOneRelation,
  TRelationDefinition,
  TRelationDefinitions,
  TRelationMetadata,
} from '@/relational/core/models/common';
