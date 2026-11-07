import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { QueryOperators, Sorts } from '@venizia/ignis-filter';

/** What a request filter holds that names fields: `where`, `order` and the `include` scopes. */
export interface IRequestFilterShape {
  where?: unknown;
  order?: unknown;
  include?: unknown;
}

/** Which part of a filter a key came from: the refusal reads like the query's own refusal of an unknown column of that part. */
export type TRequestFilterKeyKind = 'where' | 'order';

/**
 * How one model judges a key of a request filter. The repository of a model supplies it, so the judgment reads a key the way
 * that model's own query does (a relational JSON path names its first part, a search field is a dotted name), and a refusal
 * is the error that query gives for a column or field that does not exist.
 */
export interface IRequestFilterJudge {
  /** Whether the key reaches a field the model hides. */
  isHidden(opts: { key: string }): boolean;

  /** The error to throw for a key that is hidden: the one an unknown column or field gets, so a caller cannot tell them apart. */
  refuse(opts: { kind: TRequestFilterKeyKind; key: string; tableName: string }): Error;

  /** The judge of the model a relation of this model points to; `undefined` when the relation is unknown (the query refuses it). A nested include is judged by the relation judge's own `relation`. */
  relation?(opts: { relation: string }): IRequestFilterJudge | undefined;
}

/**
 * A filter that comes from a request is not allowed to name a field the model hides. Hidden fields are never returned, but a
 * `where` or an `order` on one reveals its value one question at a time. The check runs where a request enters
 * (the generated controllers), never in the repository's own verbs, so server code can still filter and sort on a hidden field.
 */
export class RequestFilterGuard {
  /** The names of `hidden` a dotted key reaches: the key is one, a dotted prefix of one, or has one as its dotted prefix (`meta` and `meta.pin.x` both reach `meta.pin`). */
  static isHiddenByName(opts: { key: string; hidden: ReadonlySet<string> }): boolean {
    const { key, hidden } = opts;

    for (const name of hidden) {
      if (key === name || key.startsWith(`${name}.`) || name.startsWith(`${key}.`)) {
        return true;
      }
    }

    return false;
  }

  /** The refusal when a model has no query error of its own to borrow: a 400 `Column NOT FOUND`. */
  static columnNotFound(opts: { scope: string; key: string }): Error {
    const quoted = JSON.stringify(opts.key).replace(
      /[\u007f-\u009f\u2028\u2029]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );

    return getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `[${opts.scope}] Column NOT FOUND | key: ${quoted}`,
    });
  }

  /** Refuses a `where` that names a hidden field, at any depth of `and` and `or`. */
  static assertWhere(opts: {
    where?: unknown;
    judge: IRequestFilterJudge;
    tableName: string;
  }): void {
    const { where, judge, tableName } = opts;

    if (typeof where !== 'object' || where === null) {
      return;
    }

    for (const key of Object.keys(where)) {
      const value = (where as Record<string, unknown>)[key];

      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        for (const branch of Array.isArray(value) ? value : [value]) {
          RequestFilterGuard.assertWhere({ where: branch, judge, tableName });
        }

        continue;
      }

      if (judge.isHidden({ key })) {
        throw judge.refuse({ kind: 'where', key, tableName });
      }
    }
  }

  /** Refuses an `order` that names a hidden field (a string or a list of `'field DIRECTION'` entries), reading each entry as the query does. */
  static assertOrder(opts: {
    order?: unknown;
    judge: IRequestFilterJudge;
    tableName: string;
  }): void {
    const { order, judge, tableName } = opts;

    if (order === undefined || order === null) {
      return;
    }

    for (const entry of Array.isArray(order) ? order : [order]) {
      if (typeof entry !== 'string') {
        continue;
      }

      const { field } = Sorts.parseEntry({ entry });

      if (judge.isHidden({ key: field })) {
        throw judge.refuse({ kind: 'order', key: field, tableName });
      }
    }
  }

  /**
   * Refuses a filter that names a hidden field in its `where`, its `order`, or the `scope` of any `include`, each level
   * judged by the model it reads (`judge.relation` answers it).
   */
  static assertFilter(opts: {
    filter?: IRequestFilterShape;
    judge: IRequestFilterJudge;
    tableName: string;
  }): void {
    const { filter, judge, tableName } = opts;

    if (typeof filter !== 'object' || filter === null) {
      return;
    }

    RequestFilterGuard.assertWhere({ where: filter.where, judge, tableName });
    RequestFilterGuard.assertOrder({ order: filter.order, judge, tableName });

    if (!Array.isArray(filter.include)) {
      return;
    }

    for (const entry of filter.include) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }

      const { relation, scope } = entry as { relation?: unknown; scope?: IRequestFilterShape };

      if (typeof relation !== 'string' || scope === undefined) {
        continue;
      }

      const relationJudge = judge.relation?.({ relation });

      // An unknown relation is refused by the query itself; here only a known one has a model to judge by.
      if (relationJudge === undefined) {
        continue;
      }

      RequestFilterGuard.assertFilter({ filter: scope, judge: relationJudge, tableName: relation });
    }
  }
}
