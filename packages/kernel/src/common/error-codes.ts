import type { TConstValue } from '@venizia/ignis-helpers/common';
import { MessageCode } from '@venizia/ignis-helpers/core';

/** Every machine-readable code the framework raises - clients branch on the code, so these strings ARE a public contract. Built via {@link MessageCode.build}, which rejects a malformed code at import time; `core.*` and `database.*` belong to IGNIS, applications use their own namespace. */
const build = (parts: Array<string>): string => {
  return MessageCode.build({ parts });
};

/** Framework-level failures that are not specific to one connector or component. */
export class CoreErrorCodes {
  static readonly NOT_SUPPORTED = build(['core', 'not_supported']);
  static readonly DATABASE_CONFLICT = build(['database', 'conflict']);
}

/** Valid `CoreErrorCodes` values. */
export type TCoreErrorCode = TConstValue<typeof CoreErrorCodes>;

/**
 * The `normalized.code` of a database error the request caused (HTTP 400): one per common SQLSTATE, then one per class.
 *
 * @useWhen Telling apart the database errors a user's input caused, to translate them or branch on them.
 */
export class DatabaseErrorCodes {
  static readonly STRING_TOO_LONG = build(['core', 'database', 'string_too_long']);
  static readonly NUMERIC_OUT_OF_RANGE = build(['core', 'database', 'numeric_out_of_range']);
  static readonly INVALID_TEXT_REPRESENTATION = build([
    'core',
    'database',
    'invalid_text_representation',
  ]);

  static readonly NOT_NULL_VIOLATION = build(['core', 'database', 'not_null_violation']);
  static readonly FOREIGN_KEY_VIOLATION = build(['core', 'database', 'foreign_key_violation']);
  static readonly UNIQUE_VIOLATION = build(['core', 'database', 'unique_violation']);
  static readonly CHECK_VIOLATION = build(['core', 'database', 'check_violation']);

  /** Any other class `22` (data exception). */
  static readonly INVALID_INPUT = build(['core', 'database', 'invalid_input']);

  /** Any other class `23` (integrity constraint) or `44` (view check option). */
  static readonly CONSTRAINT_VIOLATION = build(['core', 'database', 'constraint_violation']);
}

/** Valid `DatabaseErrorCodes` values. */
export type TDatabaseErrorCode = TConstValue<typeof DatabaseErrorCodes>;

/** Failures raised by the search connectors (Typesense, Meilisearch) and the neutral search tier. */
export class SearchErrorCodes {
  static readonly NOT_FOUND = build(['core', 'search_engine', 'not_found']);
  static readonly ALREADY_EXISTS = build(['core', 'search_engine', 'already_exists']);
  static readonly TASK_TIMEOUT = build(['core', 'search_engine', 'task_timeout']);
  static readonly DEPENDENCY_UNAVAILABLE = build([
    'core',
    'search_engine',
    'dependency_unavailable',
  ]);
}

/** Valid `SearchErrorCodes` values. */
export type TSearchErrorCode = TConstValue<typeof SearchErrorCodes>;
