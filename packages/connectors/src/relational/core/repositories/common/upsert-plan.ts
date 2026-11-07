import { EchoUtility } from '@/common/internal';
import type { IUniqueKey, TTableSchemaWithId } from '@/relational/core/models/common';
import { AuditFields } from '@/relational/core/models/common/constants';
import { UniqueKeyReader } from '@/relational/core/models/common/unique-key-reader';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { AnyColumn, SQL } from 'drizzle-orm';
import { getTableName, sql } from 'drizzle-orm';

/** The creation audit columns: written on insert, never by the update branch of an upsert. */
const CREATION_AUDIT = new Set<string>([AuditFields.CREATED_AT, AuditFields.CREATED_BY]);

/** What one upsert statement needs once its options are checked. */
export interface IUpsertPlan<Schema extends TTableSchemaWithId = TTableSchemaWithId> {
  key: IUniqueKey<Schema>;
  /** The key's columns, from the table schema: the SQL quotes the column the schema declares, never a caller string. */
  target: AnyColumn[];
  /** The properties the update branch writes. */
  updateKeys: string[];
  /** `property -> excluded.<column>`: the update branch writes the value the statement tried to insert. */
  set: Record<string, SQL>;
}

/**
 * Checks an upsert's key and `update` list against the table, before any guard or SQL runs, and builds the conflict
 * branch. Internal: the `common` barrel does not export this file.
 */
export class UpsertPlan {
  static build<Schema extends TTableSchemaWithId>(opts: {
    schema: Schema;
    data: Record<string, unknown>;
    on?: IUniqueKey<Schema>;
    update?: ReadonlyArray<string>;
  }): IUpsertPlan<Schema> {
    const { schema, data, on, update } = opts;
    const columns = UniqueKeyReader.columnsOf({ table: schema });
    const refuse = (detail: string) =>
      getError({ message: `[upsert] Table: ${getTableName(schema)} | ${detail}` });
    const echo = (value: unknown) => `'${EchoUtility.toSafeEcho({ value: String(value) })}'`;

    // A handle cast past the type check, or built for another table, would put another table's columns in the target.
    if (on !== undefined && on.table !== schema) {
      throw refuse(`'on' is a key of another table | key: ${echo(on.name)}`);
    }

    const key = on ?? UniqueKeyReader.primaryOf({ table: schema });

    // A handle built by hand can name columns the table does not have.
    for (const property of key.columns) {
      if (typeof property !== 'string' || !Object.hasOwn(columns, property)) {
        throw refuse(
          `the key '${key.name}' names a column the table does not have | column: ${echo(property)}`,
        );
      }
    }

    const keyColumns = new Set<string>(key.columns);
    const primary: ReadonlyArray<string> = UniqueKeyReader.primaryOf({ table: schema }).columns;
    const isSent = (property: string) =>
      Object.hasOwn(columns, property) && data[property] !== undefined;

    let updateKeys: string[];

    if (update === undefined) {
      // A primary key is never rewritten unless the caller names it: a conflict on another key would otherwise move the row.
      updateKeys = Object.keys(data).filter(
        (property) =>
          isSent(property) &&
          !keyColumns.has(property) &&
          !primary.includes(property) &&
          !CREATION_AUDIT.has(property),
      );
    } else {
      if (!Array.isArray(update)) {
        throw refuse("'update' must be a list of columns");
      }

      updateKeys = [...new Set(update)];

      for (const property of updateKeys) {
        if (typeof property !== 'string' || !Object.hasOwn(columns, property)) {
          throw refuse(`'update' names no column of the table | key: ${echo(property)}`);
        }

        if (keyColumns.has(property)) {
          throw refuse(
            `'update' names a column of the key '${key.name}': the key is what the row is found by | key: ${echo(property)}`,
          );
        }

        if (CREATION_AUDIT.has(property)) {
          throw refuse(`'update' names a creation audit column | key: ${echo(property)}`);
        }

        if (primary.includes(property)) {
          throw refuse(`'update' names a primary key column | key: ${echo(property)}`);
        }

        // The update branch writes the value sent for the column; a column not sent would be overwritten by its default.
        if (!isSent(property)) {
          throw refuse(`'update' names a column the data does not set | key: ${echo(property)}`);
        }
      }
    }

    if (updateKeys.length === 0) {
      throw refuse("nothing to update on a conflict | 'data' sets no column outside the key");
    }

    const set: Record<string, SQL> = {};

    for (const property of updateKeys) {
      set[property] = sql`excluded.${sql.identifier(columns[property].name)}`;
    }

    return {
      key,
      target: key.columns.map((property) => columns[property]),
      updateKeys,
      set,
    };
  }

  /**
   * Every key column must hold a value: a null never conflicts in SQLite or in default Postgres, so the upsert would
   * insert a duplicate each time. A `nullsNotDistinct` key takes an explicit null. Run on the row the CREATE guard
   * returns, so a scope column the guard assigns counts as set.
   */
  static assertKeyValues<Schema extends TTableSchemaWithId>(opts: {
    schema: Schema;
    key: IUniqueKey<Schema>;
    row: Record<string, unknown>;
    /** True before the CREATE guard: a scope column absent there may still be assigned. */
    isAbsentAllowed: boolean;
  }): void {
    const { schema, key, row, isAbsentAllowed } = opts;

    for (const property of key.columns) {
      const value = row[property];
      const isMissing =
        value === undefined ? !isAbsentAllowed : value === null && !key.nullsNotDistinct;

      if (isMissing) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          message: `[upsert] Table: ${getTableName(schema)} | the key '${key.name}' needs a value in every column | column: ${property}`,
        });
      }
    }
  }
}
