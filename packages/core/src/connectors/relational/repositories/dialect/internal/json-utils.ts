import { getError } from '@venizia/ignis-helpers/core';

/** Regex for validating JSON path components (identifiers, kebab-case, array indices). */
export const JSON_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/;

export const isJsonPath = (opts: { key: string }): boolean => {
  return opts.key.includes('.') || opts.key.includes('[');
};

export const parseJsonPath = (opts: { key: string }): { columnName: string; path: string[] } => {
  const parts = opts.key.split(/[.[\]]+/).filter(Boolean);
  const [columnName = opts.key, ...path] = parts;
  return { columnName, path };
};

/** @throws Error if any path component is invalid. */
export const validateJsonPathComponents = (opts: {
  path: string[];
  tableName: string;
  methodName: string;
}): void => {
  const { path, tableName, methodName } = opts;

  for (const part of path) {
    if (!JSON_PATH_PATTERN.test(part)) {
      throw getError({
        message: `[${methodName}] Table: ${tableName} | Invalid JSON path component: '${part}'`,
      });
    }
  }
};

/**
 * @throws Error if the column is not a JSON column. Names no engine type: `jsonb` is unreachable
 * off Postgres.
 */
export const validateJsonColumnType = (opts: {
  column: { dataType: string };
  columnName: string;
  tableName: string;
  methodName: string;
}): void => {
  const { column, columnName, tableName, methodName } = opts;

  const dataType = column.dataType.toLowerCase();
  if (dataType !== 'json' && dataType !== 'jsonb') {
    throw getError({
      message: `[${methodName}] Table: ${tableName} | Column '${columnName}' is not a JSON column | dataType: '${column.dataType}'`,
    });
  }
};
