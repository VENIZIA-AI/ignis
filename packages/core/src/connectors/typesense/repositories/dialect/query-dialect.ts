import { QueryOperators, Sorts } from '@/base/repositories/common/operators';
import { TFields, TFilter, TWhere } from '@/base/repositories/query-schemas';
import { ISearchQuery, ISearchQueryDialect } from '@/connectors/typesense/repositories/common';
import { getError } from '@venizia/ignis-helpers';

/** Maximum number of `order` entries Typesense `sort_by` can express. */
const MAX_SORT_FIELDS = 3;

/** Translates repository-level TFilter/TWhere into Typesense search params. Pure string building
 * - no dependency on the `typesense` package. Untranslatable shapes (relations, pattern/regex, JSON-path) throw. */
export class TypesenseQueryDialect implements ISearchQueryDialect {
  translate(opts: { filter?: TFilter; hiddenFields?: string[] }): ISearchQuery {
    const { filter, hiddenFields } = opts;

    if (!filter) {
      return { q: '*' };
    }

    const { where, fields, order, limit, skip, offset, include } = filter;

    if (include) {
      throw getError({
        message:
          '[TypesenseQueryDialect][translate] search() does not support "include" - relations cannot be translated to a Typesense filter',
      });
    }

    const query: ISearchQuery = { q: '*' };

    if (where) {
      const filterBy = this.translateWhere({ where });
      if (filterBy) {
        query.filter_by = filterBy;
      }
    }

    if (order) {
      query.sort_by = this.translateOrder({ order });
    }

    if (limit !== undefined) {
      query.per_page = limit;
    }

    const effectiveSkip = skip ?? offset;
    if (effectiveSkip !== undefined) {
      query.page = this.translatePage({ skip: effectiveSkip, limit });
    }

    if (fields) {
      query.include_fields = this.toFieldsCsv({ fields });
    }

    if (hiddenFields && hiddenFields.length > 0) {
      query.exclude_fields = hiddenFields.join(',');
    }

    return query;
  }

  /** Translates a `TWhere` into a Typesense `filter_by` expression. Public — reused by updateByFilter/deleteByFilter. */
  translateWhere(opts: { where: TWhere }): string {
    const { where } = opts;
    const clauses: string[] = [];

    for (const key in where) {
      // TWhere<T = any> is a mapped-over-`any` type (see base/repositories/common/types.ts) with no
      // narrower runtime shape to recover here; `unknown` is the honest type for a `for...in` value.
      const value: unknown = where[key];

      if (value === undefined) {
        continue;
      }

      switch (key) {
        case QueryOperators.AND: {
          clauses.push(this.buildLogicalGroup({ value, joiner: ' && ' }));
          break;
        }
        case QueryOperators.OR: {
          clauses.push(this.buildLogicalGroup({ value, joiner: ' || ' }));
          break;
        }
        default: {
          clauses.push(this.buildFieldClause({ field: key, value }));
        }
      }
    }

    return clauses.join(' && ');
  }

  private translatePage(opts: { skip: number; limit?: number }): number {
    const { skip, limit } = opts;

    if (limit === undefined) {
      throw getError({
        message:
          '[TypesenseQueryDialect][translate] skip/offset requires limit for search() pagination - a page cannot be expressed without a page size',
      });
    }

    if (skip % limit !== 0) {
      throw getError({
        message: '[translate] skip must be a multiple of limit for search pagination',
      });
    }

    return Math.floor(skip / limit) + 1;
  }

  private translateOrder(opts: { order: string[] }): string {
    const { order } = opts;

    if (order.length > MAX_SORT_FIELDS) {
      throw getError({
        message: `[TypesenseQueryDialect][translate] search() sort_by supports at most ${MAX_SORT_FIELDS} fields | got: ${order.length}`,
      });
    }

    return order
      .map(entry => {
        const [field, direction = Sorts.ASC] = entry.trim().split(/\s+/);
        const normalizedDirection = direction.toLowerCase();

        if (!Sorts.isValid(normalizedDirection)) {
          throw getError({
            message: `[TypesenseQueryDialect][translate] Invalid sort direction '${direction}' for field '${field}'`,
          });
        }

        return `${field}:${normalizedDirection}`;
      })
      .join(',');
  }

  private toFieldsCsv(opts: { fields: TFields }): string {
    const { fields } = opts;

    if (Array.isArray(fields)) {
      return fields.join(',');
    }

    const included: string[] = [];
    for (const key in fields) {
      if (fields[key] === true) {
        included.push(key);
      }
    }

    return included.join(',');
  }

  private buildLogicalGroup(opts: { value: unknown; joiner: string }): string {
    const { value, joiner } = opts;
    const items = Array.isArray(value) ? value : [value];
    // `value` is `unknown` (see translateWhere's own TWhere-is-any-shaped note); a nested and/or
    // clause can't be runtime-validated any further than "is one of the array's elements".
    // Empty members (e.g. an `{}` where merged in by default-filter plumbing) are dropped -
    // joining them would emit malformed filter_by fragments Typesense rejects.
    const sub = items
      .map(item => this.translateWhere({ where: item as TWhere }))
      .filter(clause => clause.length > 0);

    if (sub.length === 0) {
      return '';
    }

    return `(${sub.join(joiner)})`;
  }

  private buildFieldClause(opts: { field: string; value: unknown }): string {
    const { field, value } = opts;

    if (field.includes('.')) {
      throw getError({
        message: `[TypesenseQueryDialect][translateWhere] search() does not support JSON-path fields | field: '${field}'`,
      });
    }

    if (Array.isArray(value)) {
      return `${field}:=[${this.escapeArray({ field, value })}]`;
    }

    if (!this.isOperatorObject(value)) {
      return `${field}:=${this.escapeValue({ field, value })}`;
    }

    const entries = Object.entries(value);
    const clauses = entries.map(([op, opValue]) =>
      this.buildOperatorClause({ field, op, value: opValue }),
    );

    return clauses.length === 1 ? clauses[0] : `(${clauses.join(' && ')})`;
  }

  private buildOperatorClause(opts: { field: string; op: string; value: unknown }): string {
    const { field, op, value } = opts;

    switch (op) {
      case QueryOperators.EQ: {
        return `${field}:=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.NEQ:
      case QueryOperators.NE: {
        return `${field}:!=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.IS: {
        // Mirrors PostgresQueryOperators.FNS[IS] (maps null to isNull(column)); Typesense has no null representation.
        if (value === null) {
          throw getError({
            message: `[TypesenseQueryDialect][translateWhere] search() cannot translate 'is: null' - Typesense has no null representation | field: '${field}'`,
          });
        }
        return `${field}:=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.IS_NOT: {
        // Mirrors PostgresQueryOperators.FNS[IS_NOT] (isNotNull) - same null-handling gap as IS.
        if (value === null) {
          throw getError({
            message: `[TypesenseQueryDialect][translateWhere] search() cannot translate 'isn: null' - Typesense has no null representation | field: '${field}'`,
          });
        }
        return `${field}:!=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.GT: {
        return `${field}:>${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.GTE: {
        return `${field}:>=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.LT: {
        return `${field}:<${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.LTE: {
        return `${field}:<=${this.escapeValue({ field, value })}`;
      }
      case QueryOperators.IN:
      case QueryOperators.INQ: {
        return `${field}:=[${this.escapeArray({ field, value })}]`;
      }
      case QueryOperators.NIN: {
        return `${field}:!=[${this.escapeArray({ field, value })}]`;
      }
      case QueryOperators.BETWEEN: {
        return `${field}:[${this.escapeBetween({ field, value })}]`;
      }
      default: {
        throw getError({
          message: `[TypesenseQueryDialect][translateWhere] search() does not support operator '${op}' | field: '${field}'`,
        });
      }
    }
  }

  private isOperatorObject(value: unknown): value is Record<string, unknown> {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      return false;
    }

    return Object.keys(value).length > 0;
  }

  private escapeValue(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (typeof value === 'string') {
      if (value.includes('`')) {
        throw getError({
          message: `[TypesenseQueryDialect][translateWhere] search() cannot safely represent a value containing a backtick | field: '${field}' | value: '${value}'`,
        });
      }

      return `\`${value}\``;
    }

    if (typeof value === 'number') {
      // NaN/Infinity would silently produce an unparseable filter_by token (e.g. 'price:>NaN') instead of a clear rejection.
      if (!Number.isFinite(value)) {
        throw getError({
          message: `[TypesenseQueryDialect][translateWhere] search() does not support non-finite numbers (NaN/Infinity) | field: '${field}' | value: ${value}`,
        });
      }

      return String(value);
    }

    if (typeof value === 'boolean') {
      return String(value);
    }

    throw getError({
      message: `[TypesenseQueryDialect][translateWhere] search() does not support this value type | field: '${field}' | value: ${JSON.stringify(value)}`,
    });
  }

  private escapeArray(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (!Array.isArray(value)) {
      throw getError({
        message: `[TypesenseQueryDialect][translateWhere] search() expected an array value | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    return value.map(item => this.escapeValue({ field, value: item })).join(',');
  }

  private escapeBetween(opts: { field?: string; value: unknown }): string {
    const { field, value } = opts;

    if (!Array.isArray(value) || value.length !== 2) {
      throw getError({
        message: `[TypesenseQueryDialect][translateWhere] search() 'between' requires a [min, max] tuple | field: '${field}' | value: ${JSON.stringify(value)}`,
      });
    }

    const [min, max] = value;
    return `${this.escapeValue({ field, value: min })}..${this.escapeValue({ field, value: max })}`;
  }
}
