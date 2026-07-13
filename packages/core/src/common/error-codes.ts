import type { TConstValue } from '@venizia/ignis-helpers';
import { MessageCode } from '@venizia/ignis-helpers';

/**
 * Every machine-readable code the framework itself raises. A client branches on the code, never on
 * the message text, so these strings ARE a public contract: changing one breaks every consumer that
 * maps it. Codes are built through {@link MessageCode.build}, which rejects a
 * malformed one at import time rather than shipping a code nothing can match.
 *
 * Applications declare their own codes in their own namespace (BANA uses `server.*`); `core.*` and
 * `database.*` belong to IGNIS.
 */
const build = (parts: Array<string>): string => {
  return MessageCode.build({ parts });
};

/** Framework-level failures that are not specific to one connector or component. */
export class CoreErrorCodes {
  /** A capability the implementation deliberately does not provide (HTTP 501). */
  static readonly NOT_SUPPORTED = build(['core', 'not_supported']);

  /**
   * A transient database conflict (deadlock, serialization failure) - the caller may retry.
   * Historical value, kept verbatim: clients already map this string.
   */
  static readonly DATABASE_CONFLICT = build(['database', 'conflict']);
}

export type TCoreErrorCode = TConstValue<typeof CoreErrorCodes>;

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

export type TSearchErrorCode = TConstValue<typeof SearchErrorCodes>;
