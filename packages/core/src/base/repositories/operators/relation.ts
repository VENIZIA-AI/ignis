import { TTableSchemaWithId } from '@/base/models';
import { relations as defineRelations } from 'drizzle-orm';
import { TRelationConfig } from '../common';

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
