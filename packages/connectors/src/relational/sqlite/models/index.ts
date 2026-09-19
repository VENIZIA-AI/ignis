export * from './base';
export * from './common';
export * from './enrichers';

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
