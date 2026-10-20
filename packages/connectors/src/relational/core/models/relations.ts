import { RelationTypes } from '@venizia/ignis-kernel';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TTableSchemaWithId } from './common';
import type {
  IManyRelation,
  IOneRelation,
  TRelationDefinitions,
  TRelationMetadata,
} from './common';

/** Declares a to-many relation to `schema`. */
export const many = <Schema extends TTableSchemaWithId>(
  schema: Schema,
  metadata?: TRelationMetadata<typeof RelationTypes.MANY>,
): IManyRelation<Schema> => ({ type: RelationTypes.MANY, schema, metadata });

/** Declares a to-one relation to `schema`. */
export const one = <Schema extends TTableSchemaWithId>(
  schema: Schema,
  metadata?: TRelationMetadata<typeof RelationTypes.ONE>,
): IOneRelation<Schema> => ({ type: RelationTypes.ONE, schema, metadata });

/** Flattens the keyed form into the array shape the query dialect reads, taking each relation's name from its key. */
export const toRelationConfigs = (opts: {
  relations: TRelationDefinitions;
}): Array<TRelationConfig> => {
  const { relations } = opts;
  const configs: Array<TRelationConfig> = [];

  for (const [name, relation] of Object.entries(relations)) {
    configs.push(
      relation.type === RelationTypes.MANY
        ? { name, type: RelationTypes.MANY, schema: relation.schema, metadata: relation.metadata }
        : { name, type: RelationTypes.ONE, schema: relation.schema, metadata: relation.metadata },
    );
  }

  return configs;
};
