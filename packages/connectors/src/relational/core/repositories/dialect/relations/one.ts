import { RelationTypes } from '@venizia/ignis-kernel';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { getTableName, is } from 'drizzle-orm';
import type { AnyColumn, Table } from 'drizzle-orm';
import { getTableConfig as getPgTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig as getSqliteTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { TRelationConfig } from '../../common';
import { OneRelationSides } from './common';
import type { IForeignKeyLink, TColumns, TOneMetadata, TOneResolution } from './common';

/**
 * The `one` relations of one entity. Written `fields` and `references` are used as written;
 * otherwise they are read off the table's foreign key to the target - one key is used. Of two or
 * more, the keys another `one` writes out as its fields are set aside; one left is used, none or
 * several is ambiguous. With no key on this side but one on the target's, this is the inverse side
 * of a one-to-one, which drizzle pairs from the side that owns the key; two keys back are ambiguous
 * there too. A `one` to its own table reads the self key only when it is the entity's sole fieldless
 * `one` to itself.
 */
export class OneRelations {
  private readonly source: Table;

  /** Every fieldless `one` this entity declares to its own table. */
  private readonly selfReferences: Array<string> = [];

  /** The fields of every `one` this entity writes out. */
  private readonly writtenFields: Array<Array<AnyColumn>> = [];

  /**
   * drizzle runs the relations callback on every `drizzle({ schema })` - the drivers make one per
   * transaction - and a table's foreign keys never change, so each `one` is resolved once.
   */
  private readonly resolutions = new Map<string, TOneResolution>();

  constructor(opts: { source: Table; relations: Array<TRelationConfig> }) {
    this.source = opts.source;

    for (const def of opts.relations) {
      if (def?.type !== RelationTypes.ONE) {
        continue;
      }
      if (def.metadata?.fields) {
        this.writtenFields.push(def.metadata.fields);
      } else if (
        def.schema === opts.source &&
        OneRelations.isFieldless({ metadata: def.metadata })
      ) {
        this.selfReferences.push(def.name);
      }
    }
  }

  /** The drizzle config of a `one` relation, or undefined for the inverse side, which carries none. */
  configFor(opts: { name: string; target: Table; metadata: TOneMetadata }) {
    const { name, metadata } = opts;
    const resolution = this.resolve(opts);

    if (resolution.side === OneRelationSides.INVERSE) {
      return undefined;
    }
    return {
      relationName: name,
      ...metadata,
      fields: resolution.link.columns,
      references: resolution.link.foreignColumns,
    };
  }

  private resolve(opts: { name: string; target: Table; metadata: TOneMetadata }): TOneResolution {
    let resolution = this.resolutions.get(opts.name);
    if (!resolution) {
      resolution = this.resolveOne(opts);
      this.resolutions.set(opts.name, resolution);
    }
    return resolution;
  }

  private resolveOne(opts: {
    name: string;
    target: Table;
    metadata: TOneMetadata;
  }): TOneResolution {
    const { name, target, metadata } = opts;
    const { source, selfReferences, writtenFields } = this;
    const sourceName = getTableName(source);
    const targetName = getTableName(target);

    if (metadata?.fields && metadata.references) {
      return {
        side: OneRelationSides.OWNING,
        link: { columns: metadata.fields, foreignColumns: metadata.references },
      };
    }
    if (metadata?.fields || metadata?.references) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[createRelations] relation '${name}' on ${sourceName} has fields or references but not both | Pass both, or neither to read them off the foreign key`,
      });
    }

    const owned = OneRelations.foreignKeysBetween({ from: source, to: target });
    const candidates =
      owned.length > 1
        ? owned.filter(
            link => !writtenFields.some(columns => OneRelations.startsAt({ link, columns })),
          )
        : owned;

    // One self key can back one of them only; read by every one, it hands the wrong row to the rest.
    if (target === source && selfReferences.length > 1) {
      const example =
        candidates.length === 1
          ? ` (the one that walks the key back: ${OneRelations.reversedConfig({ link: candidates[0], source, target })})`
          : '';
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[createRelations] relation '${name}': ${sourceName} declares ${selfReferences.length} one() relations to itself without fields (${selfReferences.join(', ')}) | A self key backs only one of them - write fields and references on the others${example}`,
      });
    }

    if (candidates.length === 1) {
      return { side: OneRelationSides.OWNING, link: candidates[0] };
    }
    if (owned.length > 1) {
      const listed = candidates.length > 0 ? candidates : owned;
      const columns = listed
        .map(link => OneRelations.columnNames({ columns: link.columns }))
        .join(', ');
      const reason =
        candidates.length > 0
          ? `${candidates.length} foreign keys on ${sourceName} reference ${targetName} (${columns})${candidates.length < owned.length ? ' besides the ones written out on other relations' : ''}`
          : `${owned.length} foreign keys on ${sourceName} reference ${targetName} (${columns}) and other relations write out every one`;
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[createRelations] relation '${name}': ${reason} | Pass fields and references to pick one`,
      });
    }

    const inverse = OneRelations.foreignKeysBetween({ from: target, to: source });
    if (inverse.length > 1) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[createRelations] relation '${name}': ${inverse.length} foreign keys on ${targetName} reference ${sourceName} (${inverse.map(link => OneRelations.columnNames({ columns: link.columns })).join(', ')}), so drizzle cannot tell which one this side pairs with | Pick one: write fields and references on this side, reversed - e.g. ${OneRelations.reversedConfig({ link: inverse[0], source, target })}`,
      });
    }
    if (inverse.length === 1) {
      if (metadata?.relationName) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[createRelations] relation '${name}' is the inverse side of a one-to-one - the foreign key (${OneRelations.columnNames({ columns: inverse[0].columns })}) is on ${targetName} | drizzle pairs an inverse one() by table, never by relationName. Remove relationName, or write fields and references on this side, reversed: ${OneRelations.reversedConfig({ link: inverse[0], source, target })}`,
        });
      }
      return { side: OneRelationSides.INVERSE };
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
      message: `[createRelations] relation '${name}': no foreign key links ${sourceName} and ${targetName} | Add .references() to the column, or pass fields and references`,
    });
  }

  /** A foreign key always names at least one column; this lets the type say so. */
  private static isNonEmpty(columns: Array<AnyColumn>): columns is TColumns {
    return columns.length > 0;
  }

  /** The foreign keys declared on `from` whose referenced table is `to`. */
  private static foreignKeysBetween(opts: { from: Table; to: Table }): Array<IForeignKeyLink> {
    const { from, to } = opts;

    let references: Array<{
      columns: Array<AnyColumn>;
      foreignColumns: Array<AnyColumn>;
      foreignTable: Table;
    }> = [];
    if (is(from, PgTable)) {
      references = getPgTableConfig(from).foreignKeys.map(foreignKey => foreignKey.reference());
    } else if (is(from, SQLiteTable)) {
      references = getSqliteTableConfig(from).foreignKeys.map(foreignKey => foreignKey.reference());
    }

    const links: Array<IForeignKeyLink> = [];
    for (const reference of references) {
      const { columns, foreignColumns, foreignTable } = reference;
      if (
        foreignTable === to &&
        OneRelations.isNonEmpty(columns) &&
        OneRelations.isNonEmpty(foreignColumns)
      ) {
        links.push({ columns, foreignColumns });
      }
    }
    return links;
  }

  private static columnNames(opts: { columns: Array<AnyColumn> }): string {
    return opts.columns.map(column => column.name).join(', ');
  }

  private static qualifiedNames(opts: { table: Table; columns: Array<AnyColumn> }): string {
    return opts.columns.map(column => `${getTableName(opts.table)}.${column.name}`).join(', ');
  }

  /** The written form that walks `link` back from the table it references: `fields [users.id] references [profiles.user_id]`. */
  private static reversedConfig(opts: {
    link: IForeignKeyLink;
    source: Table;
    target: Table;
  }): string {
    const { link, source, target } = opts;
    const fields = OneRelations.qualifiedNames({ table: source, columns: link.foreignColumns });
    const references = OneRelations.qualifiedNames({ table: target, columns: link.columns });

    return `fields [${fields}] references [${references}]`;
  }

  /** Whether `link` starts at exactly these columns, in order. */
  private static startsAt(opts: { link: IForeignKeyLink; columns: Array<AnyColumn> }): boolean {
    const { link, columns } = opts;
    return (
      link.columns.length === columns.length &&
      link.columns.every((column, index) => column === columns[index])
    );
  }

  /** A `one` that writes neither fields nor references, and so reads them off a foreign key. */
  private static isFieldless(opts: { metadata: TOneMetadata }): boolean {
    return !opts.metadata?.fields && !opts.metadata?.references;
  }
}
