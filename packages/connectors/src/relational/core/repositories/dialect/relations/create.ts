// Deep import, not the `@/base` barrel: the barrel re-exports applications, forming the init cycle inversion mixins -> this file -> @/base -> applications -> Container.
import { RelationTypes } from '@venizia/ignis-kernel';
import type { TTableSchemaWithId } from '@/relational/core/models/common';
import { relations as defineRelations } from 'drizzle-orm';
import type { Relation } from 'drizzle-orm';
import type { TRelationConfig } from '../../common';
import { ManyRelations } from './many';
import { OneRelations } from './one';

/** Creates Drizzle ORM relations from a declarative configuration array. */
export const createRelations = <Schema extends TTableSchemaWithId = TTableSchemaWithId>(opts: {
  source: Schema;
  relations: Array<TRelationConfig>;
}) => {
  const { source, relations } = opts;
  const ones = new OneRelations({ source, relations });

  return {
    definitions: relations.reduce((curr, def) => {
      if (!def) {
        return curr;
      }

      curr[def.name] = def;
      return curr;
    }, {}),
    relations: defineRelations(source, ({ one, many }) => {
      return relations.reduce<Record<string, Relation>>((curr, def) => {
        if (!def) {
          return curr;
        }

        switch (def.type) {
          case RelationTypes.ONE: {
            const config = ones.configFor({
              name: def.name,
              target: def.schema,
              metadata: def.metadata,
            });
            curr[def.name] = config ? one(def.schema, config) : one(def.schema);
            break;
          }
          case RelationTypes.MANY: {
            curr[def.name] = many(
              def.schema,
              ManyRelations.configFor({ name: def.name, metadata: def.metadata }),
            );
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
