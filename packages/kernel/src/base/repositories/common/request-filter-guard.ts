import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { QueryOperators } from '@venizia/ignis-filter';

/** What a request filter holds that names fields: `where`, `order` and the `include` scopes. */
export interface IRequestFilterShape {
  where?: unknown;
  order?: unknown;
  include?: unknown;
}

/** The hidden fields of the model a relation points to; `undefined` when the relation is unknown (the query then refuses it). */
export type TRelationHiddenResolver = (opts: {
  relation: string;
}) => ReadonlySet<string> | undefined;

/**
 * A filter that comes from a request is not allowed to name a field the model hides. Hidden fields are never returned, but a
 * `where` or an `order` on one reveals its value one question at a time. The check runs where a request enters
 * (the generated controllers), never in the repository, so server code can still filter and sort on a hidden field.
 *
 * The answer is the one an unknown column gets (`Column NOT FOUND`), so a caller cannot tell a hidden field from one that does not exist.
 */
export class RequestFilterGuard {
  /** The column a key or an order entry starts with: `secret.path`, `secret->>path` and `secret[0]` all name `secret`. */
  static rootOf(opts: { key: string }): string {
    return /^[A-Za-z0-9_$]*/.exec(opts.key.trim())?.[0] ?? '';
  }

  private static refuse(opts: { scope: string; key: string }): never {
    const quoted = JSON.stringify(opts.key).replace(
      /[\u007f-\u009f\u2028\u2029]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );

    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `[${opts.scope}] Column NOT FOUND | key: ${quoted}`,
    });
  }

  /** Refuses a `where` that names a hidden field, at any depth of `and` and `or`. */
  static assertWhere(opts: { scope: string; where?: unknown; hidden: ReadonlySet<string> }): void {
    const { scope, where, hidden } = opts;

    if (hidden.size === 0 || typeof where !== 'object' || where === null) {
      return;
    }

    for (const key of Object.keys(where)) {
      const value = (where as Record<string, unknown>)[key];

      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        for (const branch of Array.isArray(value) ? value : [value]) {
          RequestFilterGuard.assertWhere({ scope, where: branch, hidden });
        }

        continue;
      }

      if (hidden.has(RequestFilterGuard.rootOf({ key }))) {
        RequestFilterGuard.refuse({ scope, key });
      }
    }
  }

  /** Refuses an `order` that names a hidden field (a string or a list of `'field DIRECTION'` entries). */
  static assertOrder(opts: { scope: string; order?: unknown; hidden: ReadonlySet<string> }): void {
    const { scope, order, hidden } = opts;

    if (hidden.size === 0 || order === undefined || order === null) {
      return;
    }

    for (const entry of Array.isArray(order) ? order : [order]) {
      if (typeof entry !== 'string') {
        continue;
      }

      const field = entry.trim().split(/\s+/)[0] ?? '';

      if (hidden.has(RequestFilterGuard.rootOf({ key: field }))) {
        RequestFilterGuard.refuse({ scope, key: field });
      }
    }
  }

  /**
   * Refuses a filter that names a hidden field in its `where`, its `order`, or the `scope` of any `include`, each level
   * judged by the hidden fields of the model it reads (`resolveRelation` answers them).
   */
  static assertFilter(opts: {
    scope: string;
    filter?: IRequestFilterShape;
    hidden: ReadonlySet<string>;
    resolveRelation?: TRelationHiddenResolver;
  }): void {
    const { scope, filter, hidden, resolveRelation } = opts;

    if (typeof filter !== 'object' || filter === null) {
      return;
    }

    RequestFilterGuard.assertWhere({ scope, where: filter.where, hidden });
    RequestFilterGuard.assertOrder({ scope, order: filter.order, hidden });

    if (!Array.isArray(filter.include)) {
      return;
    }

    for (const entry of filter.include) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }

      const { relation, scope: relationScope } = entry as {
        relation?: unknown;
        scope?: IRequestFilterShape;
      };

      if (typeof relation !== 'string' || relationScope === undefined) {
        continue;
      }

      const relationHidden = resolveRelation?.({ relation });

      // An unknown relation is refused by the query itself; here only a known one has a hidden set to apply.
      if (relationHidden === undefined) {
        continue;
      }

      RequestFilterGuard.assertFilter({
        scope,
        filter: relationScope,
        hidden: relationHidden,
        resolveRelation: (inner) =>
          resolveRelation?.({ relation: `${relation}.${inner.relation}` }),
      });
    }
  }
}
