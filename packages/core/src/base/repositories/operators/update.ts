import { TTableSchemaWithId } from '@/base/models';
import { BaseHelper, getError } from '@venizia/ignis-helpers';
import { sql, SQL } from 'drizzle-orm';
import { getCachedColumns, TTableColumns } from '../common';
import {
  isJsonPath,
  parseJsonPath,
  validateJsonColumnType,
  validateJsonPathComponents,
} from './json-utils';

/** Parsed JSON path update. */
interface IJsonPathUpdate {
  columnName: string;
  path: string[];
  value: any;
}

/** Grouped updates for a single JSON column. */
interface IColumnUpdates {
  column: any;
  updates: Array<{ path: string[]; value: any }>;
}

/** Result of transforming update data for Drizzle. */
export interface ITransformedUpdateData {
  /** Regular field updates (non-JSON-path keys) */
  regularFields: Record<string, any>;
  /** SQL expressions for JSON path updates, keyed by column name */
  jsonExpressions: Record<string, SQL>;
}

/** Transforms update data to support nested JSON path updates via chained jsonb_set calls. */
export class UpdateBuilder extends BaseHelper {
  constructor() {
    super({ scope: UpdateBuilder.name });
  }
  /** Separates regular fields from JSON path updates and builds SQL expressions. */
  transform<Schema extends TTableSchemaWithId>(opts: {
    tableName: string;
    schema: Schema;
    data: Record<string, any>;
  }): ITransformedUpdateData {
    const { tableName, schema, data } = opts;
    const columns = this.getColumns(schema);

    if (!columns || Object.keys(columns).length === 0) {
      throw getError({
        message: `[UpdateBuilder][transform] Table: ${tableName} | Failed to get table columns`,
      });
    }

    const regularFields: Record<string, any> = {};
    const jsonPathUpdates: IJsonPathUpdate[] = [];

    for (const key in data) {
      const value = data[key];

      if (value === undefined) {
        continue;
      }

      if (!isJsonPath({ key })) {
        if (!columns[key]) {
          throw getError({
            message: `[UpdateBuilder][transform] Table: ${tableName} | Column NOT FOUND | key: '${key}'`,
          });
        }
        regularFields[key] = value;
        continue;
      }

      const parsed = parseJsonPath({ key });
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

    if (jsonPathUpdates.length === 0) {
      return { regularFields, jsonExpressions: {} };
    }

    const groupedByColumn = this.groupUpdatesByColumn({
      jsonPathUpdates,
      columns,
    });

    const jsonExpressions: Record<string, SQL> = {};
    for (const [columnName, columnUpdates] of groupedByColumn) {
      jsonExpressions[columnName] = this.buildChainedJsonbSet({
        column: columnUpdates.column,
        updates: columnUpdates.updates,
      });
    }

    return { regularFields, jsonExpressions };
  }

  /** Combines regular fields and JSON expressions into final update data for Drizzle's .set(). */
  toUpdateData(opts: { transformed: ITransformedUpdateData }): Record<string, any> {
    const { regularFields, jsonExpressions } = opts.transformed;
    return { ...regularFields, ...jsonExpressions };
  }
  /** Gets columns using shared cache utility. */
  private getColumns<Schema extends TTableSchemaWithId>(schema: Schema) {
    return getCachedColumns(schema);
  }

  /** Groups JSON path updates by target column for chaining jsonb_set calls. */
  private groupUpdatesByColumn(opts: {
    jsonPathUpdates: IJsonPathUpdate[];
    columns: TTableColumns;
  }): Map<string, IColumnUpdates> {
    const grouped = new Map<string, IColumnUpdates>();

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

  /** Builds chained jsonb_set calls for multiple path updates on same column. */
  private buildChainedJsonbSet(opts: {
    column: any;
    updates: Array<{ path: string[]; value: any }>;
  }): SQL {
    const { column, updates } = opts;
    const columnName = column.name;

    let expression = `"${columnName}"`;

    for (const update of updates) {
      const pathLiteral = `'{${update.path.join(',')}}'`;
      const valueLiteral = this.serializeJsonValue(update.value);
      expression = `jsonb_set(${expression}, ${pathLiteral}, ${valueLiteral}, true)`;
    }

    return sql.raw(expression);
  }

  /** Serializes a JavaScript value to PostgreSQL JSONB literal. */
  private serializeJsonValue(value: any): string {
    if (value === null) {
      return "'null'::jsonb";
    }

    const jsonString = JSON.stringify(value).replace(/'/g, "''");
    return `'${jsonString}'::jsonb`;
  }
}
