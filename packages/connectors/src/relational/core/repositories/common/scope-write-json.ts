import { FilterKeys } from '@venizia/ignis-filter';
import { RecordUtility } from '@venizia/ignis-helpers/core';
import { ScopeOperations } from '@venizia/ignis-kernel';
import type { TScopeOperation } from '@venizia/ignis-kernel';

/** A scope key that names one member of a JSON column: `metadata.merchantId` or `metadata[merchantId]`. */
export interface IScopeJsonKey {
  column: string;
  member: string;
}

/**
 * What a write payload says about one JSON scope key. `untouched` is an update that does not name the column (the row was
 * chosen through the scoped `where`, so it stays inside). `absent` is a column or a key that is not there, or is `null`:
 * the same "shared" case as an unowned row. `value` is what the payload sets the key to. `denied` is a payload the guard
 * will not read.
 */
export type TScopeJsonRead =
  | { type: 'absent' }
  | { type: 'value'; value: unknown }
  | { type: 'denied'; detail: string };

/**
 * The write side of a scope on a JSON member (`access.resolve` returning `{ 'metadata.merchantId': 'm-1' }`): which keys
 * the guard accepts, and what a create or an update payload says about the key. Read nothing here compiles a query: the
 * read path builds the same key into SQL through the dialect, and the mutation `where` does too.
 *
 * Deliberately narrow: ONE member of ONE column (depth 1), compared by `eq` or `in`. Anything else is not a scope the guard
 * can hold a payload to, and the write is refused instead.
 */
export class ScopeJsonKey {
  /** A member name: an identifier or a kebab-case word. A numeric part is an array index, and an index is not a tenant key. */
  private static readonly MEMBER = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

  /** Keys that would reach the prototype of a payload object. */
  private static readonly FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

  /** `key` as a column and one member, or why the guard cannot hold a payload to it. */
  static parse(opts: { key: string }): IScopeJsonKey | { reason: string } {
    const { columnName, path } = FilterKeys.parseJsonPath(opts);

    if (path.length !== 1) {
      return {
        reason: `the nested path '${opts.key}' cannot be checked on a write | only one member of a JSON column can (depth 1)`,
      };
    }

    const [member] = path;

    if (
      member === undefined ||
      !ScopeJsonKey.MEMBER.test(member) ||
      ScopeJsonKey.FORBIDDEN.has(member)
    ) {
      return {
        reason: `the nested path '${opts.key}' cannot be checked on a write | '${member}' is not a plain member name`,
      };
    }

    return { column: columnName, member };
  }

  /** The one spelling the guard keys its constraints by, whichever of the dot or bracket forms the resolver used. */
  static canonical(opts: IScopeJsonKey): string {
    return `${opts.column}.${opts.member}`;
  }

  /** The column and member of a canonical constraint key, `undefined` for a plain column. */
  static split(opts: { constraint: string }): IScopeJsonKey | undefined {
    const at = opts.constraint.indexOf('.');

    return at < 0
      ? undefined
      : { column: opts.constraint.slice(0, at), member: opts.constraint.slice(at + 1) };
  }

  /** What `value`, a JSON column as a payload carries it, says about `member`. */
  private static readColumn(opts: { value: unknown; member: string }): TScopeJsonRead {
    const { value, member } = opts;

    if (value === null || value === undefined) {
      return { type: 'absent' };
    }

    // A literal object only: an array, a string, a number, a Date or a raw `sql` value is not a JSON object the guard can read.
    if (!RecordUtility.isPlainObject(value)) {
      return { type: 'denied', detail: 'the JSON column is not an object' };
    }

    return Object.hasOwn(value, member)
      ? { type: 'value', value: value[member] }
      : { type: 'absent' };
  }

  /**
   * Every statement the payload `row` makes about `member` of `column`, for `operation`. An empty list is a payload that
   * leaves the key as it is.
   *
   * A create reads the column in the row. An update is a PARTIAL payload: its keys can name the whole column (a replacement
   * of the JSON), a path of it (`jsonb_set`, in any spelling), or both; every key that reaches the column is judged, so
   * no spelling slips past. The whole column together with a path of it is refused: the path wins in SQL and the
   * whole value would be silently dropped. A path under the scope member is refused, and a path beside it is not the guard's business.
   */
  static reads(opts: {
    row: Record<string, unknown>;
    column: string;
    member: string;
    operation: TScopeOperation;
  }): Array<TScopeJsonRead> {
    const { row, column, member, operation } = opts;

    switch (operation) {
      case ScopeOperations.CREATE: {
        return [
          Object.hasOwn(row, column)
            ? ScopeJsonKey.readColumn({ value: row[column], member })
            : { type: 'absent' },
        ];
      }

      default: {
        const keys = Object.keys(row).filter(
          (key) => row[key] !== undefined && FilterKeys.columnOf({ key }) === column,
        );
        const paths = keys.filter((key) => key !== column);

        if (keys.length === 0) {
          return [];
        }

        if (keys.includes(column) && paths.length > 0) {
          return [
            { type: 'denied', detail: 'a whole JSON column and a path of it in one payload' },
          ];
        }

        if (keys.includes(column)) {
          return [ScopeJsonKey.readColumn({ value: row[column], member })];
        }

        return paths.flatMap((key): Array<TScopeJsonRead> => {
          const { path } = FilterKeys.parseJsonPath({ key });
          const [first] = path;

          if (first !== member) {
            return [];
          }

          return path.length === 1
            ? [{ type: 'value', value: row[key] }]
            : [{ type: 'denied', detail: 'a path under the scope member cannot be checked' }];
        });
      }
    }
  }
}
