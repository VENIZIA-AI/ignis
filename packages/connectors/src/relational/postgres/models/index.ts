export * from './base';
export * from './common';
export * from './enrichers';

// Compatibility aliases - same class, historical public names kept for existing apps.
export {
  BaseRelationalEntity as BaseEntity,
  BaseRelationalEntity as BasePostgresEntity,
} from './base';

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
