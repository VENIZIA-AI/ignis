import { TTableSchemaWithId } from '@/base/models';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { getTableColumns, sql, SQL } from 'drizzle-orm';
import {
  isJsonPath,
  parseJsonPath,
  validateJsonColumnType,
  validateJsonPathComponents,
} from './json-utils';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Represents a parsed JSON path update.
 */
interface TJsonPathUpdate {
  columnName: string;
  path: string[];
  value: any;
}

/**
 * Represents grouped updates for a single JSON column.
 */
interface TColumnUpdates {
  column: any;
  updates: Array<{ path: string[]; value: any }>;
}

/**
 * Result of transforming update data for Drizzle.
 */
export interface TTransformedUpdateData {
  /** Regular field updates (non-JSON-path keys) */
  regularFields: Record<string, any>;
  /** SQL expressions for JSON path updates, keyed by column name */
  jsonExpressions: Record<string, SQL>;
}

// -----------------------------------------------------------------------------
// UpdateBuilder Class
// -----------------------------------------------------------------------------

/**
 * Transforms update data objects to support nested JSON path updates.
 *
 * Converts data like:
 * ```typescript
 * { name: 'John', 'metadata.settings.theme': 'dark', 'metadata.version': 2 }
 * ```
 *
 * Into Drizzle-compatible format with chained jsonb_set calls:
 * ```typescript
 * {
 *   name: 'John',
 *   metadata: sql`jsonb_set(jsonb_set("metadata", '{settings,theme}', '"dark"'::jsonb, true), '{version}', '2'::jsonb, true)`
 * }
 * ```
 *
 * @example
 * ```typescript
 * const builder = new UpdateBuilder();
 * const transformed = builder.transform({
 *   tableName: 'users',
 *   schema: UserSchema,
 *   data: { name: 'John', 'metadata.theme': 'dark' }
 * });
 * const updateData = builder.toUpdateData({ transformed });
 * // Use with Drizzle: connector.update(schema).set(updateData)
 * ```
 */
export class UpdateBuilder extends BaseHelper {
  /** Cache for table columns to avoid repeated calls to getTableColumns. */
  private static columnCache = new WeakMap<
    TTableSchemaWithId,
    ReturnType<typeof getTableColumns>
  >();

  constructor() {
    super({ scope: UpdateBuilder.name });
  }

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  /**
   * Transforms update data to handle JSON path updates.
   *
   * @param opts.tableName - Name of the table (for error messages)
   * @param opts.schema - The Drizzle table schema
   * @param opts.data - The update data (may contain JSON paths)
   * @returns Object with regularFields and jsonExpressions
   *
   * @throws Error if column not found
   * @throws Error if JSON path targets non-JSON/JSONB column
   * @throws Error if JSON path component is invalid
   * @throws Error if JSON path is empty (e.g., 'column.')
   */
  transform<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    data: Record<string, any>;
  }): TTransformedUpdateData {
    const { tableName, schema, data } = opts;
    const columns = this.getColumns(schema);

    if (!columns || Object.keys(columns).length === 0) {
      throw getError({
        message: `[UpdateBuilder][transform] Table: ${tableName} | Failed to get table columns`,
      });
    }

    const regularFields: Record<string, any> = {};
    const jsonPathUpdates: TJsonPathUpdate[] = [];

    // Separate regular fields from JSON path updates
    for (const key in data) {
      const value = data[key];

      // Skip undefined values (consistent with existing behavior)
      if (value === undefined) {
        continue;
      }

      if (!isJsonPath({ key })) {
        // Regular field - validate column exists
        if (!columns[key]) {
          throw getError({
            message: `[UpdateBuilder][transform] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
          });
        }
        regularFields[key] = value;
        continue;
      }

      // JSON path update - parse and validate
      const parsed = parseJsonPath(key);
      const column = columns[parsed.columnName];

      if (!column) {
        throw getError({
          message: `[UpdateBuilder][transform] Table: ${tableName} | Column NOT FOUND | key: '${parsed.columnName}'`,
        });
      }

      validateJsonColumnType({
        column,
        columnName: parsed.columnName,
        tableName,
        methodName: 'UpdateBuilder.transform',
      });

      validateJsonPathComponents({
        path: parsed.path,
        tableName,
        methodName: 'UpdateBuilder.transform',
      });

      if (parsed.path.length === 0) {
        throw getError({
          message: `[UpdateBuilder][transform] Table: ${tableName} | Empty JSON path for column '${parsed.columnName}'`,
        });
      }

      jsonPathUpdates.push({
        columnName: parsed.columnName,
        path: parsed.path,
        value,
      });
    }

    // If no JSON path updates, return early
    if (jsonPathUpdates.length === 0) {
      return { regularFields, jsonExpressions: {} };
    }

    // Group updates by column name
    const groupedByColumn = this.groupUpdatesByColumn({
      jsonPathUpdates,
      columns,
    });

    // Build SQL expressions for each JSON column
    const jsonExpressions: Record<string, SQL> = {};
    for (const [columnName, columnUpdates] of groupedByColumn) {
      jsonExpressions[columnName] = this.buildChainedJsonbSet({
        column: columnUpdates.column,
        updates: columnUpdates.updates,
      });
    }

    return { regularFields, jsonExpressions };
  }

  /**
   * Combines regular fields and JSON expressions into final update data.
   *
   * @param opts.transformed - The result from transform()
   * @returns Object suitable for Drizzle's .set() method
   */
  toUpdateData(opts: { transformed: TTransformedUpdateData }): Record<string, any> {
    const { regularFields, jsonExpressions } = opts.transformed;
    return { ...regularFields, ...jsonExpressions };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /** Gets columns from cache or computes and caches them. */
  private getColumns<Schema extends TTableSchemaWithId>(schema: Schema) {
    let columns = UpdateBuilder.columnCache.get(schema);
    if (!columns) {
      columns = getTableColumns(schema);
      UpdateBuilder.columnCache.set(schema, columns);
    }
    return columns;
  }

  /**
   * Groups JSON path updates by their target column.
   * This allows us to chain multiple jsonb_set calls for the same column.
   */
  private groupUpdatesByColumn(opts: {
    jsonPathUpdates: TJsonPathUpdate[];
    columns: ReturnType<typeof getTableColumns>;
  }): Map<string, TColumnUpdates> {
    const grouped = new Map<string, TColumnUpdates>();

    for (const update of opts.jsonPathUpdates) {
      if (!grouped.has(update.columnName)) {
        grouped.set(update.columnName, {
          column: opts.columns[update.columnName],
          updates: [],
        });
      }
      grouped.get(update.columnName)!.updates.push({
        path: update.path,
        value: update.value,
      });
    }

    return grouped;
  }

  /**
   * Builds chained jsonb_set calls for multiple path updates on same column.
   *
   * @example
   * For updates: [{ path: ['a'], value: 1 }, { path: ['b'], value: 2 }]
   * Generates: jsonb_set(jsonb_set("col", '{a}', '1'::jsonb, true), '{b}', '2'::jsonb, true)
   */
  private buildChainedJsonbSet(opts: {
    column: any;
    updates: Array<{ path: string[]; value: any }>;
  }): SQL {
    const { column, updates } = opts;
    const columnName = column.name;

    // Start with the column reference
    let expression = `"${columnName}"`;

    // Chain jsonb_set calls for each update
    // jsonb_set(target, path, new_value, create_missing)
    // create_missing = true to create intermediate keys
    for (const update of updates) {
      const pathLiteral = `'{${update.path.join(',')}}'`;
      const valueLiteral = this.serializeJsonValue(update.value);
      expression = `jsonb_set(${expression}, ${pathLiteral}, ${valueLiteral}, true)`;
    }

    return sql.raw(expression);
  }

  /**
   * Serializes a JavaScript value to PostgreSQL JSONB literal.
   *
   * @example
   * serializeJsonValue('dark') => ''"dark"''::jsonb
   * serializeJsonValue(123) => ''123''::jsonb
   * serializeJsonValue(true) => ''true''::jsonb
   * serializeJsonValue(null) => ''null''::jsonb
   * serializeJsonValue({ a: 1 }) => ''{"a":1}''::jsonb
   * serializeJsonValue([1, 2]) => ''[1,2]''::jsonb
   */
  private serializeJsonValue(value: any): string {
    // Handle null explicitly
    if (value === null) {
      return "'null'::jsonb";
    }

    // Serialize to JSON string and escape single quotes for PostgreSQL
    const jsonString = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonString}'::jsonb`;
  }
}
