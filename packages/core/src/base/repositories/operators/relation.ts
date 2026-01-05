import { TTableSchemaWithId } from '@/base/models';
import { relations as defineRelations } from 'drizzle-orm';
import { TRelationConfig } from '../common';

// -----------------------------------------------------------------------------
// Relation Builder
// -----------------------------------------------------------------------------

/**
 * Creates Drizzle ORM relations from a configuration array.
 *
 * This utility simplifies defining entity relations by converting a declarative
 * configuration into Drizzle's relation definitions.
 *
 * @template Schema - The source table schema type
 * @param opts - Configuration options
 * @param opts.source - The source table schema
 * @param opts.relations - Array of relation configurations
 * @returns Object containing definitions map and Drizzle relations
 *
 * @example
 * ```typescript
 * const userRelations = createRelations({
 *   source: UserSchema,
 *   relations: [
 *     {
 *       name: 'posts',
 *       type: RelationTypes.MANY,
 *       schema: PostSchema,
 *       metadata: { fields: [Post.schema.authorId], references: [User.schema.id] }
 *     },
 *     {
 *       name: 'profile',
 *       type: RelationTypes.ONE,
 *       schema: ProfileSchema,
 *       metadata: { fields: [Profile.schema.userId], references: [User.schema.id] }
 *     }
 *   ]
 * });
 * ```
 */
export const createRelations = <Schema extends TTableSchemaWithId = TTableSchemaWithId>(opts: {
  source: Schema;
  relations: Array<TRelationConfig>;
}) => {
  const { source, relations } = opts;
  return {
    definitions: relations.reduce((curr, def) => {
      if (!def) {
        return curr;
      }

      curr[def.name] = def;
      return curr;
    }, {}),
    relations: defineRelations(source, ({ one, many }) => {
      return relations.reduce((curr, def) => {
        if (!def) {
          return curr;
        }

        const { name, type, schema, metadata } = def;

        switch (type) {
          case 'one': {
            curr[name] = one(schema, Object.assign({}, { relationName: name }, metadata));
            break;
          }
          case 'many': {
            curr[name] = many(schema, Object.assign({}, { relationName: name }, metadata));
            break;
          }
          default: {
            break;
          }
        }

        return curr;
      }, {});
    }),
  };
};
