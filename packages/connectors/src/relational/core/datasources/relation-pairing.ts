import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  getTableName,
  getTableUniqueName,
  is,
  Many,
  normalizeRelation,
  One,
} from 'drizzle-orm';
import type { Relation } from 'drizzle-orm';

/** A relation drizzle cannot pair, with the message that names it and its fix. */
interface IUnpairedRelation {
  relation: Relation;
  message: string;
}

/** What a datasource's schema discovery learns about its relations. */
interface IRelationPairingReport {
  /** Relations drizzle cannot pair, though their target has a model on the datasource. */
  unpaired: Array<IUnpairedRelation>;
  /** `Entity.relation -> Table` for each relation whose table has no model on the datasource. */
  outside: Array<string>;
}

/**
 * Pairs every relation the way drizzle does on the first query that includes it, so schema
 * discovery can report - or refuse - what that query would hit. A relation whose table has no
 * model on the datasource is kept apart: a datasource that carries a subset of models on purpose
 * is a normal shape, not a defect.
 */
export class RelationPairing {
  static inspect(opts: {
    dataSource: string;
    schema: Record<string, unknown>;
  }): IRelationPairingReport {
    const { dataSource, schema } = opts;
    const { tables, tableNamesMap } = extractTablesRelationalConfig(
      schema,
      createTableRelationsHelpers,
    );

    const unpaired: Array<IUnpairedRelation> = [];
    const outside: Array<string> = [];

    for (const [entity, table] of Object.entries(tables)) {
      for (const [name, relation] of Object.entries(table.relations)) {
        const target = tableNamesMap[getTableUniqueName(relation.referencedTable)];
        if (!target) {
          outside.push(`${entity}.${name} -> ${getTableName(relation.referencedTable)}`);
          continue;
        }

        try {
          normalizeRelation(tables, tableNamesMap, relation);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          unpaired.push({
            relation,
            message: `[${dataSource}][discoverSchema] Cannot resolve relation '${name}' on entity '${entity}': ${reason} | ${RelationPairing.buildUnpairedHint({ entity, target, relation })}`,
          });
        }
      }
    }

    return { unpaired, outside };
  }

  /** An inverse one() - no fields of its own - exists only through the relation that pairs it. */
  static isInverseOne(opts: { relation: Relation }): boolean {
    return is(opts.relation, One) && !opts.relation.config;
  }

  /** One line for every relation that points outside the datasource. */
  static describeOutside(opts: { outside: Array<string> }): string {
    const { outside } = opts;
    const count = outside.length === 1 ? '1 relation points' : `${outside.length} relations point`;
    return `${count} to a table outside this datasource: ${outside.join(', ')} | A query that includes one fails here; bind that model to this datasource if you need it`;
  }

  /** The fix for a relation drizzle cannot pair, in the entities' own names. */
  private static buildUnpairedHint(opts: {
    entity: string;
    target: string;
    relation: Relation;
  }): string {
    const { entity, target, relation } = opts;

    if (is(relation, Many)) {
      return `A many() pairs with the one() on '${target}' named '${relation.relationName}' - a one() is named by its key, or by its relationName if it sets one | Add that one() on '${target}', pointing back to '${entity}', or set relationName here to the name of the one() already there`;
    }
    return `'${target}' holds the foreign key, so this one() pairs with the one relation there that points back to '${entity}' - there must be exactly one | Add that one() on '${target}', or write fields and references on this side`;
  }
}
