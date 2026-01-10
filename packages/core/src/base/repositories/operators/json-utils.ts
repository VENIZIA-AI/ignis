import { getError } from '@venizia/ignis-helpers';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Regex pattern for validating JSON path components.
 * Allows identifiers with hyphens for kebab-case (e.g., user-id, meta_data) or array indices.
 *
 * Valid: name, user_id, api-key, metadata_v2, 0, 123
 * Invalid: 2name, user@domain, user.id, user name
 */
export const JSON_PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$|^\d+$/;

// -----------------------------------------------------------------------------
// JSON Path Detection & Parsing
// -----------------------------------------------------------------------------

/**
 * Checks if a key represents a JSON path (contains '.' or '[').
 *
 * @example
 * isJsonPath('metadata.score') // true
 * isJsonPath('tags[0]') // true
 * isJsonPath('regular_field') // false
 */
export const isJsonPath = (opts: { key: string }): boolean => {
  return opts.key.includes('.') || opts.key.includes('[');
};

/**
 * Parses a JSON path string into column name and path components.
 *
 * @example
 * parseJsonPath('metadata.settings.theme')
 * // => { columnName: 'metadata', path: ['settings', 'theme'] }
 *
 * parseJsonPath('data[0].name')
 * // => { columnName: 'data', path: ['0', 'name'] }
 *
 * parseJsonPath('config.user-id')
 * // => { columnName: 'config', path: ['user-id'] }
 */
export const parseJsonPath = (opts: { key: string }): { columnName: string; path: string[] } => {
  const parts = opts.key.split(/[.[\]]+/).filter(Boolean);
  const [columnName = opts.key, ...path] = parts;
  return { columnName, path };
};

// -----------------------------------------------------------------------------
// Validation Utilities
// -----------------------------------------------------------------------------

/**
 * Validates JSON path components against allowed pattern.
 *
 * @throws Error if any path component is invalid
 */
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
 * Validates that a column is JSON/JSONB type.
 *
 * @throws Error if column is not JSON/JSONB type
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
      message: `[${methodName}] Table: ${tableName} | Column '${columnName}' is not JSON/JSONB type | dataType: '${column.dataType}'`,
    });
  }
};
