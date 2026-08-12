import type { TTableSchemaWithId } from '@/connectors/relational/models/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { ITransformedUpdateData, TTableColumns } from '../common';
import { getCachedColumns } from '../common';
import {
  isJsonPath,
  parseJsonPath,
  validateJsonColumnType,
  validateJsonPathComponents,
} from './internal/json-utils';

/**
 * Splits `data` into plain columns and JSON-path writes, validating every JSON key before any of it
 * becomes SQL. That validation is why this is a base and not a copied skeleton: an engine composing
 * through `sql.raw` is injectable the moment it forgets `validateJsonPathComponents`.
 *
 * Subclasses supply only the JSON composition: `jsonb_set` on Postgres, `json_set` on SQLite.
 */
export abstract class RelationalUpdateBuilder extends BaseHelper {
  /**
   * Wraps `target` so the value lands at `path`. Called once per path, each call receiving the
   * expression built so far, so two paths on one column nest instead of discarding each other.
   */
  protected abstract composeJsonSet(opts: { target: SQL; path: string[]; value: any }): SQL;

  /** Separates regular fields from JSON path updates and builds the SQL expressions. */
  transform<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    data: Record<string, any>;
  }): ITransformedUpdateData {
    const { tableName, schema, data } = opts;
    const columns = getCachedColumns(schema);

    if (!columns || Object.keys(columns).length === 0) {
      throw getError({
        message: `[${this.scope}][transform] Table: ${tableName} | Failed to get table columns`,
      });
    }

    const regularFields: Record<string, any> = {};
    const jsonExpressions: Record<string, SQL> = {};

    for (const key in data) {
      const value = data[key];

      if (value === undefined) {
        continue;
      }

      if (!isJsonPath({ key })) {
        if (!columns[key]) {
          throw getError({
            message: `[${this.scope}][transform] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
          });
        }

        regularFields[key] = value;
        continue;
      }

      const { columnName, path } = this.resolveJsonTarget({ key, columns, tableName });

      // Each path WRAPS the expression built so far. Restarting from the bare
      // column would make the second path on one column discard the first.
      jsonExpressions[columnName] = this.composeJsonSet({
        target: jsonExpressions[columnName] ?? sql.identifier(columns[columnName].name),
        path,
        value,
      });
    }

    return { regularFields, jsonExpressions };
  }

  /** Combines regular fields and JSON expressions into the final payload for Drizzle's `.set()`. */
  toUpdateData(opts: { transformed: ITransformedUpdateData }): Record<string, any> {
    const { regularFields, jsonExpressions } = opts.transformed;

    return { ...regularFields, ...jsonExpressions };
  }

  /**
   * Resolves a JSON-path key to its schema PROPERTY name plus the validated path. The property
   * is what `jsonExpressions` is keyed by, while the emitted SQL quotes the DB column.
   */
  private resolveJsonTarget(opts: { key: string; columns: TTableColumns; tableName: string }): {
    columnName: string;
    path: string[];
  } {
    const { key, columns, tableName } = opts;

    const parsed = parseJsonPath({ key });
    const column = columns[parsed.columnName];

    if (!column) {
      throw getError({
        message: `[${this.scope}][transform] Table: ${tableName} | Column NOT FOUND | key: '${parsed.columnName}'`,
      });
    }

    // `scope` is the concrete subclass name, so both message
    // forms keep naming the builder that actually ran.
    validateJsonColumnType({
      column,
      columnName: parsed.columnName,
      tableName,
      methodName: `${this.scope}.transform`,
    });

    validateJsonPathComponents({
      path: parsed.path,
      tableName,
      methodName: `${this.scope}.transform`,
    });

    if (parsed.path.length === 0) {
      throw getError({
        message: `[${this.scope}][transform] Table: ${tableName} | Empty JSON path for column '${parsed.columnName}'`,
      });
    }

    return parsed;
  }
}
