import type { TConstValue } from '@venizia/ignis-helpers/common';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { QueryOperators, Sorts } from '@venizia/ignis-filter';

/** What a request filter holds that a query reads: `where`, `order`, the `include` scopes, and the `fields` that can decide the order it reads them in. */
export interface IRequestFilterShape {
  where?: unknown;
  order?: unknown;
  include?: unknown;
  fields?: unknown;
}

/** Which part of a filter a key came from: the refusal reads like the query's own refusal of an unknown column of that part. */
export type TRequestFilterKeyKind = 'where' | 'order';

/** The parts of a request filter a query reads, one at a time, in an order the query decides. */
export class RequestFilterParts {
  static readonly WHERE = 'where';
  static readonly ORDER = 'order';
  static readonly INCLUDE = 'include';
}

/** A part of a request filter: `where`, `order` or `include`. */
export type TRequestFilterPart = TConstValue<typeof RequestFilterParts>;

/**
 * How one model judges a key of a request filter. The repository of a model supplies it, so the judgment reads a key the way
 * that model's own query does (a relational JSON path names its first part, a search field is a dotted name), and a refusal
 * is the error that query gives for a column or field that does not exist.
 *
 * A filter that names a hidden field is refused with the first refusal the query itself would meet if the hidden name were
 * missing: `readOrder` gives the order the query reads the parts in, `filterRefusal` and `queryRefusal` the errors it throws
 * on its own before that point. Without them the parts are read `where`, `order`, `include`, and nothing else is refused.
 */
export interface IRequestFilterJudge {
  /** Whether the key reaches a field the model hides. */
  isHidden(opts: { key: string }): boolean;

  /** The error to throw for a key that is hidden: the one an unknown column or field gets, so a caller cannot tell them apart. */
  refuse(opts: { kind: TRequestFilterKeyKind; key: string; tableName: string }): Error;

  /** The judge of the model a relation of this model points to; `undefined` when the relation is unknown (the query refuses it). A nested include is judged by the relation judge's own `relation`. */
  relation?(opts: { relation: string }): IRequestFilterJudge | undefined;

  /** The parts of `filter` in the order this model's query reads them. */
  readOrder?(opts: { filter: IRequestFilterShape }): ReadonlyArray<TRequestFilterPart>;

  /** The error the query throws for `filter` as a whole before it reads any key of it, or `undefined`. */
  filterRefusal?(opts: { filter: IRequestFilterShape; tableName: string }): Error | undefined;

  /**
   * The error the query throws for one piece of a filter on its own, or `undefined` when it reads the piece. A piece is a
   * `where` of one key (`{ [key]: value }`), one `order` entry, or one `include` entry.
   */
  queryRefusal?(opts: {
    part: TRequestFilterPart;
    value: unknown;
    tableName: string;
  }): Error | undefined;
}

/** The first refusal a walk of a filter met, before any hidden key. */
interface IRequestFilterWalk {
  refusal?: Error;
}

const DEFAULT_READ_ORDER: ReadonlyArray<TRequestFilterPart> = [
  RequestFilterParts.WHERE,
  RequestFilterParts.ORDER,
  RequestFilterParts.INCLUDE,
];

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
    RequestFilterGuard.walkWhere({ ...opts, walk: {} });
  }

  /** Refuses an `order` that names a hidden field (a string or a list of `'field DIRECTION'` entries), reading each entry as the query does. */
  static assertOrder(opts: {
    order?: unknown;
    judge: IRequestFilterJudge;
    tableName: string;
  }): void {
    RequestFilterGuard.walkOrder({ ...opts, walk: {} });
  }

  /**
   * Refuses a filter that names a hidden field in its `where`, its `order`, or the `scope` of any `include`, each level
   * judged by the model it reads (`judge.relation` answers it). The parts are read in the order the query reads them, and a
   * filter that the query refuses for another reason before it meets the hidden field gets that refusal instead, so the answer
   * is the one the same filter gets with a missing name in place of the hidden one. A filter that names no hidden field is
   * left to the query.
   */
  static assertFilter(opts: {
    filter?: IRequestFilterShape;
    judge: IRequestFilterJudge;
    tableName: string;
  }): void {
    RequestFilterGuard.walkFilter({ ...opts, walk: {} });
  }

  /** Throws for a hidden key: the refusal met before it, or the hidden key's own. Otherwise keeps the query's refusal of the piece when it is the first. */
  private static visitKey(opts: {
    walk: IRequestFilterWalk;
    judge: IRequestFilterJudge;
    tableName: string;
    part: TRequestFilterKeyKind;
    key: string;
    piece: unknown;
  }): void {
    const { walk, judge, tableName, part, key, piece } = opts;

    if (judge.isHidden({ key })) {
      throw walk.refusal ?? judge.refuse({ kind: part, key, tableName });
    }

    walk.refusal ??= judge.queryRefusal?.({ part, value: piece, tableName });
  }

  private static walkFilter(opts: {
    filter?: IRequestFilterShape;
    judge: IRequestFilterJudge;
    tableName: string;
    walk: IRequestFilterWalk;
  }): void {
    const { filter, judge, tableName, walk } = opts;

    if (typeof filter !== 'object' || filter === null) {
      return;
    }

    walk.refusal ??= judge.filterRefusal?.({ filter, tableName });

    for (const part of judge.readOrder?.({ filter }) ?? DEFAULT_READ_ORDER) {
      switch (part) {
        case RequestFilterParts.WHERE: {
          RequestFilterGuard.walkWhere({ where: filter.where, judge, tableName, walk });
          break;
        }
        case RequestFilterParts.ORDER: {
          RequestFilterGuard.walkOrder({ order: filter.order, judge, tableName, walk });
          break;
        }
        case RequestFilterParts.INCLUDE: {
          RequestFilterGuard.walkInclude({ include: filter.include, judge, tableName, walk });
          break;
        }
        default: {
          break;
        }
      }
    }
  }

  private static walkWhere(opts: {
    where?: unknown;
    judge: IRequestFilterJudge;
    tableName: string;
    walk: IRequestFilterWalk;
  }): void {
    const { where, judge, tableName, walk } = opts;

    if (typeof where !== 'object' || where === null) {
      return;
    }

    for (const key of Object.keys(where)) {
      const value = (where as Record<string, unknown>)[key];

      if (QueryOperators.LOGICAL_GROUP_OPERATORS.has(key)) {
        for (const branch of Array.isArray(value) ? value : [value]) {
          RequestFilterGuard.walkWhere({ where: branch, judge, tableName, walk });
        }

        continue;
      }

      RequestFilterGuard.visitKey({
        walk,
        judge,
        tableName,
        part: RequestFilterParts.WHERE,
        key,
        piece: { [key]: value },
      });
    }
  }

  private static walkOrder(opts: {
    order?: unknown;
    judge: IRequestFilterJudge;
    tableName: string;
    walk: IRequestFilterWalk;
  }): void {
    const { order, judge, tableName, walk } = opts;

    if (order === undefined || order === null) {
      return;
    }

    for (const entry of Array.isArray(order) ? order : [order]) {
      if (typeof entry !== 'string') {
        continue;
      }

      let field: string;

      // A judge with `queryRefusal` reads order entries with this parser, so an entry it cannot parse is the query's own
      // refusal and later entries are still judged. Any other judge's query may read the entry differently: refuse it here.
      try {
        field = Sorts.parseEntry({ entry }).field;
      } catch (error) {
        if (!judge.queryRefusal) {
          throw error;
        }

        walk.refusal ??= error as Error;
        continue;
      }

      RequestFilterGuard.visitKey({
        walk,
        judge,
        tableName,
        part: RequestFilterParts.ORDER,
        key: field,
        piece: entry,
      });
    }
  }

  private static walkInclude(opts: {
    include?: unknown;
    judge: IRequestFilterJudge;
    tableName: string;
    walk: IRequestFilterWalk;
  }): void {
    const { include, judge, tableName, walk } = opts;

    if (!Array.isArray(include)) {
      return;
    }

    for (const entry of include) {
      walk.refusal ??= judge.queryRefusal?.({
        part: RequestFilterParts.INCLUDE,
        value: entry,
        tableName,
      });

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

      RequestFilterGuard.walkFilter({
        filter: scope,
        judge: relationJudge,
        tableName: relation,
        walk,
      });
    }
  }
}
