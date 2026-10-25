import { getError } from '@venizia/ignis-helpers/core';
import {
  QueryOperators,
  RepositoryErrorCodes,
  ScopeFilterMissingBehaviors,
  ScopeFilters,
  ScopeWriteGuards,
} from '@venizia/ignis-kernel';
import type { IScopeFilterSettings, TWhere } from '@venizia/ignis-kernel';
import { HTTP } from '@venizia/ignis-helpers/common';

type TScalar = string | number | bigint | boolean | Date | null;

/** The allowed values per scope column, each normalised so `1` and `'1'` and equal dates compare equal. */
type TConstraints = Map<string, Set<string | null>>;

type TExtraction =
  | { isVerifiable: true; constraints: TConstraints }
  | { isVerifiable: false; reason: string };

const WRITE_DENIED_STATUS = HTTP.ResultCodes.RS_4.Forbidden;

const isScalar = (value: unknown): value is TScalar => {
  return (
    value === null ||
    value instanceof Date ||
    ['string', 'number', 'bigint', 'boolean'].includes(typeof value)
  );
};

const normalise = (value: TScalar): string | null => {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : String(value);
};

const intersect = (opts: { left: Set<string | null>; right: Set<string | null> }) => {
  return new Set([...opts.left].filter((value) => opts.right.has(value)));
};

/**
 * The write side of `@model` settings.scopeFilter. The resolved scope is a `where`; the guard reads
 * from it the columns it constrains and the values it allows, and holds every written row to them.
 *
 * Only shapes that can be checked are read: a column equal to a scalar or `null`, `{ eq }`, `{ inq }`
 * (or `in`), an array, `and` of those, and an `or` whose branches all constrain the same column. Anything
 * else - an `or` over several columns, ranges, `like`, a nested path - makes
 * the scope unverifiable, and the write is refused with its own message instead of being skipped.
 */
export class ScopeWriteGuard {
  static extractConstraints(opts: { where: TWhere }): TExtraction {
    const constraints: TConstraints = new Map();
    const reason = ScopeWriteGuard.collect({
      where: opts.where as Record<string, unknown>,
      constraints,
    });

    return reason === undefined
      ? { isVerifiable: true, constraints }
      : { isVerifiable: false, reason };
  }

  /** Adds the where's constraints to `constraints`; returns the reason it cannot be verified, if any. */
  private static collect(opts: {
    where: Record<string, unknown>;
    constraints: TConstraints;
  }): string | undefined {
    const { where, constraints } = opts;

    for (const [key, value] of Object.entries(where)) {
      if (key === 'and') {
        if (!Array.isArray(value)) {
          return "'and' is not a list";
        }

        for (const part of value) {
          const reason = ScopeWriteGuard.collect({
            where: part as Record<string, unknown>,
            constraints,
          });
          if (reason !== undefined) {
            return reason;
          }
        }

        continue;
      }

      if (key === 'or') {
        const union = ScopeWriteGuard.unionOfBranches({ branches: value });
        if (typeof union === 'string') {
          return union;
        }

        const existing = constraints.get(union.column);
        constraints.set(
          union.column,
          existing ? intersect({ left: existing, right: union.allowed }) : union.allowed,
        );
        continue;
      }

      if (key.includes('.')) {
        return `the nested path '${key}' cannot be checked on a write`;
      }

      const allowed = ScopeWriteGuard.allowedValues({ value });
      if (typeof allowed === 'string') {
        return `column '${key}': ${allowed}`;
      }

      const existing = constraints.get(key);
      constraints.set(key, existing ? intersect({ left: existing, right: allowed }) : allowed);
    }

    return undefined;
  }

  /**
   * An `or` is checkable only when every branch constrains the same single column with a scalar,
   * `null`, `eq`, `in` or `inq`: the allowed values are then the union of the branches. This is the
   * shared-rows scope, `{ or: [{ merchantId: { in: ids } }, { merchantId: null }] }`. Any other `or`
   * (several columns, ranges, nested `and` or `or`) cannot be checked.
   */
  private static unionOfBranches(opts: {
    branches: unknown;
  }): { column: string; allowed: Set<string | null> } | string {
    const { branches } = opts;

    if (!Array.isArray(branches) || branches.length === 0) {
      return "'or' is not a list";
    }

    let column: string | undefined;
    const allowed = new Set<string | null>();

    for (const branch of branches) {
      const entries = Object.entries((branch ?? {}) as Record<string, unknown>);
      if (entries.length !== 1) {
        return "an 'or' branch with several conditions cannot be checked on a write";
      }

      const [key, value] = entries[0];
      if (key === 'and' || key === 'or' || key.includes('.')) {
        return `an 'or' branch over '${key}' cannot be checked on a write`;
      }

      if (column !== undefined && column !== key) {
        return "an 'or' over different columns cannot be checked on a write";
      }

      column = key;
      const values = ScopeWriteGuard.allowedValues({ value });
      if (typeof values === 'string') {
        return `column '${key}': ${values}`;
      }

      values.forEach((entry) => allowed.add(entry));
    }

    return { column: column as string, allowed };
  }

  /** The values one column's condition allows, or a string naming why it cannot be checked. */
  private static allowedValues(opts: { value: unknown }): Set<string | null> | string {
    const { value } = opts;

    if (isScalar(value)) {
      return new Set([normalise(value)]);
    }

    if (Array.isArray(value)) {
      return value.every(isScalar)
        ? new Set(value.map(normalise))
        : 'a list with a non-scalar entry';
    }

    if (typeof value !== 'object' || value === undefined) {
      return 'an unsupported condition';
    }

    const operators = Object.keys(value as object);
    if (operators.length !== 1) {
      return `a condition with ${operators.length} operators cannot be checked on a write`;
    }

    const [operator] = operators;
    const operand = (value as Record<string, unknown>)[operator];

    if (operator === QueryOperators.EQ && isScalar(operand)) {
      return new Set([normalise(operand)]);
    }

    if (
      (operator === QueryOperators.INQ || operator === QueryOperators.IN) &&
      Array.isArray(operand)
    ) {
      return operand.every(isScalar)
        ? new Set(operand.map(normalise))
        : 'a list with a non-scalar entry';
    }

    return `the operator '${operator}' cannot be checked on a write`;
  }

  /**
   * Holds `rows` to the scope `settings.resolve()` returns now. Returns the rows to write: the same
   * objects when nothing changes, copies with the scope columns filled in for `assign`. Throws, and
   * so writes nothing, when any row is outside the scope.
   */
  static apply<Row extends Record<string, unknown>>(opts: {
    settings: IScopeFilterSettings;
    model: string;
    rows: Row[];
    operation: 'create' | 'update';
  }): Row[] {
    const { settings, model, rows, operation } = opts;
    const scope = settings.resolve();

    if (scope === ScopeFilters.UNRESTRICTED) {
      return rows;
    }

    if (scope === null || scope === undefined) {
      // An update is already confined by the scoped `where`, which under `deny` matches no row; the
      // guard adds nothing there. A create has no such `where`, so an unresolved scope refuses it.
      if (settings.onMissing === ScopeFilterMissingBehaviors.ALLOW || operation === 'update') {
        return rows;
      }

      throw ScopeWriteGuard.denied({
        model,
        operation,
        detail: 'no scope could be resolved for this caller',
      });
    }

    const extraction = ScopeWriteGuard.extractConstraints({ where: scope });
    if (!extraction.isVerifiable) {
      throw ScopeWriteGuard.denied({
        model,
        operation,
        detail: `the resolved scope cannot be verified on a write | ${extraction.reason}`,
      });
    }

    const { constraints } = extraction;
    const declared = settings.columns;

    if (declared) {
      const undeclared = [...constraints.keys()].find((column) => !declared.includes(column));
      if (undeclared !== undefined) {
        throw ScopeWriteGuard.denied({
          model,
          operation,
          detail: `the resolved scope constrains column '${undeclared}', which scopeFilter.columns does not declare`,
        });
      }
    }

    const isAssign = settings.writeGuard === ScopeWriteGuards.ASSIGN && operation === 'create';
    const sharedRows = settings.sharedRows === true;

    return rows.map((row) => {
      let result = row;

      for (const [column, allowed] of constraints) {
        const value = (row as Record<string, unknown>)[column];

        if (value === undefined) {
          // Absent means the database default, usually `null`, so it is held to the `null` rule.
          if (operation === 'update' || sharedRows) {
            continue;
          }

          const only = allowed.size === 1 ? [...allowed][0] : undefined;
          if (isAssign && only !== undefined && only !== null) {
            result = { ...result, [column]: only };
            continue;
          }

          throw ScopeWriteGuard.denied({
            model,
            operation,
            column,
            detail: 'the scope column is missing',
          });
        }

        const normalised = isScalar(value) ? normalise(value) : undefined;
        // A `null` branch in the scope lets this caller READ shared rows. Writing one (or moving a
        // row into the shared set) is a separate permission: only `sharedRows` grants it.
        const isOutside = normalised === null ? !sharedRows : !allowed.has(normalised as string);

        if (normalised === undefined || isOutside) {
          throw ScopeWriteGuard.denied({
            model,
            operation,
            column,
            detail: 'the value is outside the resolved scope',
          });
        }
      }

      return result;
    });
  }

  /** Names the model and the column, never a value: the caller may be a request. */
  private static denied(opts: {
    model: string;
    operation: string;
    column?: string;
    detail: string;
  }) {
    const { model, operation, column, detail } = opts;

    return getError({
      statusCode: WRITE_DENIED_STATUS,
      messageCode: RepositoryErrorCodes.SCOPE_WRITE_DENIED,
      message: [
        `[${operation}] write refused by scopeFilter | entity: ${model}`,
        ...(column ? [`column: ${column}`] : []),
        detail,
      ].join(' | '),
    });
  }
}
