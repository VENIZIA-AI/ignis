// Deep import, not the `@/base` barrel: the barrel re-exports applications, forming the init cycle inversion mixins -> this file -> @/base -> applications -> Container.
import { RelationTypes } from '@/base/repositories/common/constants';
import type { TTableSchemaWithId } from '@/connectors/relational/models/common';
import { relations as defineRelations } from 'drizzle-orm';
import type { TRelationConfig } from '../common';

/** Creates Drizzle ORM relations from a declarative configuration array. */
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
          case RelationTypes.ONE: {
            curr[name] = one(schema, Object.assign({}, { relationName: name }, metadata));
            break;
          }
          case RelationTypes.MANY: {
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
