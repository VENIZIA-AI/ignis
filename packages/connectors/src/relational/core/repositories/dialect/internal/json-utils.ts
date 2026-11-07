import { EchoUtility } from '@/common/internal';
import { FilterKeys } from '@venizia/ignis-filter';
import { getError } from '@venizia/ignis-helpers/core';

/** Regex for validating JSON path components (identifiers, kebab-case, array indices). */
export const JSON_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/;

/** Parses and validates JSON-path keys such as `meta.tags[0]` used in update data and filters. */
export class JsonPathUtility {
  // The one reader of a key, shared with the request guard: see `FilterKeys`.
  static isJsonPath(opts: { key: string }): boolean {
    return FilterKeys.isJsonPath(opts);
  }

  static parseJsonPath(opts: { key: string }): { columnName: string; path: string[] } {
    return FilterKeys.parseJsonPath(opts);
  }

  /** @throws Error if any path component is invalid. */
  static validateJsonPathComponents(opts: {
    path: string[];
    tableName: string;
    methodName: string;
  }): void {
    const { path, tableName, methodName } = opts;

    for (const part of path) {
      if (!JSON_PATH_PATTERN.test(part)) {
        throw getError({
          message: `[${methodName}] Table: ${tableName} | Invalid JSON path component: '${EchoUtility.toSafeEcho({ value: part })}'`,
        });
      }
    }
  }

  /**
   * @throws Error if the column is not a JSON column. Names no engine type: `jsonb` is unreachable
   * off Postgres.
   */
  static validateJsonColumnType(opts: {
    column: { dataType: string };
    columnName: string;
    tableName: string;
    methodName: string;
  }): void {
    const { column, columnName, tableName, methodName } = opts;

    const dataType = column.dataType.toLowerCase();

    if (dataType !== 'json' && dataType !== 'jsonb') {
      throw getError({
        message: `[${methodName}] Table: ${tableName} | Column '${columnName}' is not a JSON column | dataType: '${column.dataType}'`,
      });
    }
  }
}
