import { getError, RecordUtility } from '@venizia/ignis-helpers/core';
import {
  QueryOperators,
  RepositoryErrorCodes,
  ScopeFilterMissingBehaviors,
  ScopeFilters,
  ScopeOperations,
  ScopeWriteGuards,
} from '@venizia/ignis-kernel';
import type {
  IModelAccessSettings,
  TModelAccessSettings,
  TScopeOperation,
  TWhere,
} from '@venizia/ignis-kernel';
import { HTTP } from '@venizia/ignis-helpers/common';
import { ScopeFilterDenial, ScopeResolution } from './scope-filter';

type TScalar = string | number | bigint | boolean | Date | null;

/** One column's allowed values, each normalised so `1` and `'1'` and equal dates compare equal. */
type TAllowed = Set<string | null>;

/** One conjunction of the scope: the allowed values of each column it constrains. */
type TBranch = Map<string, TAllowed>;

/** The scope as a disjunction of branches: a row is inside it when it satisfies at least one. */
type TExtraction =
  | { isVerifiable: true; branches: TBranch[] }
  | { isVerifiable: false; reason: string };

/** What the scope becomes for a write: a `where`, no row at all, or a shape that cannot be narrowed. */
type TNarrowed =
  | { status: 'where'; where: TWhere }
  | { status: 'none' }
  | { status: 'unverifiable'; reason: string };

/** One column's condition for a write: its non-null part, nothing left, or a shape that cannot be narrowed. */
type TNarrowedCondition =
  | { status: 'condition'; value: unknown }
  | { status: 'none' }
  | { status: 'unverifiable'; reason: string };

const WRITE_DENIED_STATUS = HTTP.ResultCodes.RS_4.Forbidden;

/** The most branches a scope may expand to; past it the scope is unverifiable. */
const MAX_BRANCHES = 32;

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

const intersect = (opts: { left: TAllowed; right: TAllowed }) => {
  return new Set([...opts.left].filter((value) => opts.right.has(value)));
};

/**
 * The write side of `@model` settings.access. The resolved scope is a `where`; the guard reads it as
 * a list of branches (the columns each constrains and the values it allows) and holds every written
 * row to them.
 *
 * Only shapes that can be checked are read: a column equal to a scalar or `null`, `{ eq }`, `{ inq }`
 * (or `in`), an array, and `and` and `or` of those. Anything else - ranges, `like`, a nested path,
 * several operators on one column, an empty `or` branch, more than 32 branches - makes the scope
 * unverifiable, and the write is refused with its own message instead of being skipped.
 *
 * A scope of one branch is checked column by column: an update checks only the scope columns it
 * writes, and `sharedRows` admits `null` on any scope column. A scope of several branches is checked
 * branch by branch: a row must satisfy one branch on every column that branch constrains, an update
 * that writes a scope column must satisfy one branch on its own, and `null` passes only where the
 * branch allows it and `sharedRows` is on.
 */
export class ScopeWriteGuard {
  static extractConstraints(opts: { where: TWhere }): TExtraction {
    const branches = ScopeWriteGuard.branchesOf({ where: opts.where });

    return typeof branches === 'string'
      ? { isVerifiable: false, reason: branches }
      : { isVerifiable: true, branches };
  }

  /** The branches of a where, or the reason it cannot be verified. */
  private static branchesOf(opts: { where: unknown }): TBranch[] | string {
    const { where } = opts;

    if (!RecordUtility.isPlainRecord(where)) {
      return 'a condition that is not an object cannot be checked on a write';
    }

    let branches: TBranch[] = [new Map()];

    for (const [key, value] of Object.entries(where)) {
      const factor = ScopeWriteGuard.factorOf({ key, value });

      if (typeof factor === 'string') {
        return factor;
      }

      for (const part of factor) {
        const product = ScopeWriteGuard.multiply({ left: branches, right: part });

        if (typeof product === 'string') {
          return product;
        }

        branches = product;
      }
    }

    return branches;
  }

  /** The disjunctions one key of a where contributes, all of which must hold. */
  private static factorOf(opts: { key: string; value: unknown }): TBranch[][] | string {
    const { key, value } = opts;

    if (key === QueryOperators.AND) {
      if (!Array.isArray(value)) {
        return "'and' is not a list";
      }

      const parts: TBranch[][] = [];

      for (const part of value) {
        const branches = ScopeWriteGuard.branchesOf({ where: part });

        if (typeof branches === 'string') {
          return branches;
        }

        parts.push(branches);
      }

      return parts;
    }

    if (key === QueryOperators.OR) {
      if (!Array.isArray(value) || value.length === 0) {
        return "'or' is not a list";
      }

      const alternatives: TBranch[] = [];

      for (const part of value) {
        const branches = ScopeWriteGuard.branchesOf({ where: part });

        if (typeof branches === 'string') {
          return branches;
        }

        if (branches.some((branch) => branch.size === 0)) {
          return "an 'or' branch with no condition cannot be checked on a write";
        }

        alternatives.push(...branches);
      }

      return [ScopeWriteGuard.mergeSingleColumn({ branches: alternatives })];
    }

    if (key.includes('.')) {
      return `the nested path '${key}' cannot be checked on a write`;
    }

    const allowed = ScopeWriteGuard.allowedValues({ value });

    if (typeof allowed === 'string') {
      return `column '${key}': ${allowed}`;
    }

    return [[new Map([[key, allowed]])]];
  }

  /** Every combination of one branch from each side, with the values of a shared column intersected. */
  private static multiply(opts: { left: TBranch[]; right: TBranch[] }): TBranch[] | string {
    const { left, right } = opts;

    if (left.length * right.length > MAX_BRANCHES) {
      return `a scope of more than ${MAX_BRANCHES} branches cannot be checked on a write`;
    }

    return left.flatMap((base) => {
      return right.map((extra) => {
        const combined: TBranch = new Map(base);

        for (const [column, allowed] of extra) {
          const existing = combined.get(column);
          combined.set(column, existing ? intersect({ left: existing, right: allowed }) : allowed);
        }

        return combined;
      });
    });
  }

  /** Alternatives that each constrain one and the same column become one branch holding the union of their values. */
  private static mergeSingleColumn(opts: { branches: TBranch[] }): TBranch[] {
    const merged: TBranch[] = [];
    const byColumn = new Map<string, TAllowed>();

    for (const branch of opts.branches) {
      const [entry] = branch.size === 1 ? [...branch] : [];

      if (entry === undefined) {
        merged.push(branch);
        continue;
      }

      const [column, allowed] = entry;
      const existing = byColumn.get(column);

      if (existing) {
        allowed.forEach((value) => existing.add(value));
        continue;
      }

      const union = new Set(allowed);
      byColumn.set(column, union);
      merged.push(new Map([[column, union]]));
    }

    return merged;
  }

  /** The values one column's condition allows, or a string naming why it cannot be checked. */
  private static allowedValues(opts: { value: unknown }): TAllowed | string {
    const { value } = opts;

    if (isScalar(value)) {
      return new Set([normalise(value)]);
    }

    if (Array.isArray(value)) {
      return value.every(isScalar)
        ? new Set(value.map(normalise))
        : 'a list with a non-scalar entry';
    }

    if (!RecordUtility.isPlainRecord(value)) {
      return 'an unsupported condition';
    }

    const operators = Object.keys(value);

    if (operators.length !== 1) {
      return `a condition with ${operators.length} operators cannot be checked on a write`;
    }

    const [operator] = operators;
    const operand = value[operator];

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
   * The scope as a MUTATION `where` (update, delete, soft delete, restore). A scope with a `null`
   * branch - `{ or: [{ merchantId: { in: ids } }, { merchantId: null }] }` - lets the caller READ the
   * shared rows. Changing or deleting one is the same permission as creating one, `write.sharedRows`,
   * so without it the `null` branch is removed and only the caller's own rows match. A branch over
   * several columns that holds a `null` constraint is removed whole. With `sharedRows` the scope is
   * returned as it is.
   *
   * Only the shapes the write guard can read are narrowed. Any other shape cannot be shown to exclude
   * the shared rows, so the mutation is refused, as an update with a payload already is.
   */
  static mutationWhere(opts: {
    settings: TModelAccessSettings;
    model: string;
    operation: TScopeOperation;
    scopeWhere: TWhere;
  }): TWhere {
    const { settings, model, operation, scopeWhere } = opts;

    ScopeWriteGuard.assertWrite({ model, operation });

    // Checked with `sharedRows` too: it lets the null branch through, not a shape the guard cannot read.
    const narrowed = ScopeWriteGuard.withoutShared({ where: scopeWhere });

    if (narrowed.status === 'unverifiable') {
      throw ScopeWriteGuard.denied({
        model,
        operation,
        detail: `the resolved scope cannot be verified on a write | ${narrowed.reason}`,
      });
    }

    if (settings.write?.sharedRows === true) {
      return scopeWhere;
    }

    return narrowed.status === 'none' ? ScopeFilterDenial.where() : narrowed.where;
  }

  /** `where` with every `null` the scope allows removed; `none` when nothing but `null` was allowed. */
  private static withoutShared(opts: { where: TWhere }): TNarrowed {
    const result: TWhere = {};

    for (const [key, value] of Object.entries(opts.where)) {
      if (key === QueryOperators.AND || key === QueryOperators.OR) {
        if (!Array.isArray(value) || (key === QueryOperators.OR && value.length === 0)) {
          return { status: 'unverifiable', reason: `'${key}' is not a list` };
        }

        // An 'or' is narrowed only when the guard can read it as branches.
        if (key === QueryOperators.OR) {
          const extraction = ScopeWriteGuard.extractConstraints({ where: { [key]: value } });

          if (!extraction.isVerifiable) {
            return { status: 'unverifiable', reason: extraction.reason };
          }
        }

        const kept: TWhere[] = [];

        for (const part of value) {
          const narrowed = ScopeWriteGuard.withoutShared({
            where: RecordUtility.isPlainRecord(part) ? part : {},
          });

          if (narrowed.status === 'unverifiable') {
            return narrowed;
          }

          if (narrowed.status === 'none') {
            // One impossible 'and' part makes the whole 'and' impossible; an impossible 'or' branch just drops out.
            if (key === QueryOperators.AND) {
              return narrowed;
            }

            continue;
          }

          kept.push(narrowed.where);
        }

        if (key === QueryOperators.OR && kept.length === 0) {
          return { status: 'none' };
        }

        result[key] = kept;
        continue;
      }

      if (key.includes('.')) {
        return {
          status: 'unverifiable',
          reason: `the nested path '${key}' cannot be checked on a write`,
        };
      }

      const narrowed = ScopeWriteGuard.conditionWithoutNull({ value });

      if (narrowed.status !== 'condition') {
        return narrowed.status === 'none'
          ? { status: 'none' }
          : { status: 'unverifiable', reason: `column '${key}': ${narrowed.reason}` };
      }

      result[key] = narrowed.value;
    }

    return { status: 'where', where: result };
  }

  /** One column's condition without its `null` values, reading the same shapes `allowedValues` reads. */
  private static conditionWithoutNull(opts: { value: unknown }): TNarrowedCondition {
    const { value } = opts;

    const list = (entries: unknown[]): TNarrowedCondition => {
      if (!entries.every(isScalar)) {
        return { status: 'unverifiable', reason: 'a list with a non-scalar entry' };
      }

      const kept = entries.filter((entry) => entry !== null);

      return kept.length === 0 ? { status: 'none' } : { status: 'condition', value: kept };
    };

    if (isScalar(value)) {
      return value === null ? { status: 'none' } : { status: 'condition', value };
    }

    if (Array.isArray(value)) {
      return list(value);
    }

    if (!RecordUtility.isPlainRecord(value)) {
      return { status: 'unverifiable', reason: 'an unsupported condition' };
    }

    const operators = Object.keys(value);

    if (operators.length !== 1) {
      return {
        status: 'unverifiable',
        reason: `a condition with ${operators.length} operators cannot be checked on a write`,
      };
    }

    const [operator] = operators;
    const operand = value[operator];

    if (operator === QueryOperators.EQ && isScalar(operand)) {
      return operand === null ? { status: 'none' } : { status: 'condition', value };
    }

    if (
      (operator === QueryOperators.INQ || operator === QueryOperators.IN) &&
      Array.isArray(operand)
    ) {
      const narrowed = list(operand);

      return narrowed.status === 'condition'
        ? { status: 'condition', value: { [operator]: narrowed.value } }
        : narrowed;
    }

    return {
      status: 'unverifiable',
      reason: `the operator '${operator}' cannot be checked on a write`,
    };
  }

  /**
   * Holds `rows` to the scope `settings.resolve()` returns now. Returns the rows to write: the same
   * objects when nothing changes, copies with the scope columns filled in for `assign`. Throws, and
   * so writes nothing, when any row is outside the scope.
   */
  static apply<Row extends Record<string, unknown>>(opts: {
    settings: IModelAccessSettings;
    model: string;
    rows: Row[];
    operation: TScopeOperation;
  }): Row[] {
    const { settings, model, rows, operation } = opts;

    ScopeWriteGuard.assertWrite({ model, operation });

    const scope = ScopeResolution.normalize({ value: settings.resolve({ operation }) });

    if (scope === ScopeFilters.UNRESTRICTED) {
      return rows;
    }

    if (scope === null || scope === undefined) {
      // An update is already confined by the scoped `where`, which under `deny` matches no row; the
      // guard adds nothing there. A create has no such `where`, so an unresolved scope refuses it.
      if (
        settings.onMissing === ScopeFilterMissingBehaviors.ALLOW ||
        operation !== ScopeOperations.CREATE
      ) {
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

    const { branches } = extraction;
    const declared = settings.columns;

    if (declared) {
      const undeclared = branches
        .flatMap((branch) => [...branch.keys()])
        .find((column) => !declared.includes(column));

      if (undeclared !== undefined) {
        throw ScopeWriteGuard.denied({
          model,
          operation,
          detail: `the resolved scope constrains column '${undeclared}', which access.columns does not declare`,
        });
      }
    }

    const isAssign =
      settings.write?.mode === ScopeWriteGuards.ASSIGN && operation === ScopeOperations.CREATE;
    const sharedRows = settings.write?.sharedRows === true;
    const [single] = branches.length === 1 ? branches : [];

    return rows.map((row) => {
      const check = { model, operation, row, isAssign, sharedRows };

      return single
        ? ScopeWriteGuard.holdToColumns({ ...check, branch: single })
        : ScopeWriteGuard.holdToBranches({ ...check, branches });
    });
  }

  /** A scope of one branch: each scope column the row holds is checked on its own. */
  private static holdToColumns<Row extends Record<string, unknown>>(opts: {
    model: string;
    operation: TScopeOperation;
    row: Row;
    branch: TBranch;
    isAssign: boolean;
    sharedRows: boolean;
  }): Row {
    const { model, operation, row, branch, isAssign, sharedRows } = opts;
    let result = row;

    for (const [column, allowed] of branch) {
      const value = row[column];

      if (value === undefined) {
        if (operation !== ScopeOperations.CREATE) {
          continue;
        }

        // `assign` first: stamping gives the row an owner, which is safer than leaving it shared.
        const only = allowed.size === 1 ? [...allowed][0] : undefined;

        if (isAssign && only !== undefined && only !== null) {
          result = { ...result, [column]: only };
          continue;
        }

        // Absent means the database default, usually `null`, so it is held to the `null` rule.
        if (sharedRows) {
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
      const isInside =
        normalised === null ? sharedRows : normalised !== undefined && allowed.has(normalised);

      if (!isInside) {
        throw ScopeWriteGuard.denied({
          model,
          operation,
          column,
          detail: 'the value is outside the resolved scope',
        });
      }
    }

    return result;
  }

  /**
   * A scope of several branches: the row must satisfy one branch on every column it constrains. An
   * absent column is `null` on a create; an update that writes no scope column is not checked, and one
   * that does must satisfy a branch with the columns it writes, whatever the stored row holds.
   */
  private static holdToBranches<Row extends Record<string, unknown>>(opts: {
    model: string;
    operation: TScopeOperation;
    row: Row;
    branches: TBranch[];
    isAssign: boolean;
    sharedRows: boolean;
  }): Row {
    const { model, operation, row, branches, isAssign, sharedRows } = opts;
    const isCreate = operation === ScopeOperations.CREATE;

    if (
      !isCreate &&
      branches.every((branch) => [...branch.keys()].every((column) => row[column] === undefined))
    ) {
      return row;
    }

    // A branch with an empty set admits no row, so it drops out before `assign` counts the branches that still fit.
    const reachable = branches.filter((branch) => {
      return [...branch.values()].every((allowed) => allowed.size > 0);
    });

    // `isPartial` skips the columns the candidate leaves out: the branch can still apply to it.
    const satisfies = (check: { branch: TBranch; candidate: Row; isPartial: boolean }) => {
      return [...check.branch].every(([column, allowed]) => {
        const value = check.candidate[column];

        if (value === undefined && check.isPartial) {
          return true;
        }

        return ScopeWriteGuard.admits({
          allowed,
          value: isCreate ? (value ?? null) : value,
          sharedRows,
        });
      });
    };

    let result = row;

    if (isAssign) {
      const feasible = reachable.filter((branch) =>
        satisfies({ branch, candidate: row, isPartial: true }),
      );

      if (feasible.length === 1) {
        for (const [column, allowed] of feasible[0]) {
          const [only] = allowed.size === 1 ? [...allowed] : [];

          if (row[column] === undefined && only !== undefined && only !== null) {
            result = { ...result, [column]: only };
          }
        }
      }
    }

    if (reachable.some((branch) => satisfies({ branch, candidate: result, isPartial: false }))) {
      return result;
    }

    throw ScopeWriteGuard.denied({
      model,
      operation,
      detail: 'the row satisfies no branch of the resolved scope',
    });
  }

  /** Whether a written value is in a branch's allowed set; `null` also needs `sharedRows`. */
  private static admits(opts: { allowed: TAllowed; value: unknown; sharedRows: boolean }): boolean {
    const { allowed, value, sharedRows } = opts;

    if (!isScalar(value)) {
      return false;
    }

    const normalised = normalise(value);

    return allowed.has(normalised) && (normalised !== null || sharedRows);
  }

  /**
   * The write guard runs for a write only. A READ reaching it is a bug in the caller, not a request,
   * so it throws a plain error rather than a refusal the caller could map to a status.
   */
  private static assertWrite(opts: { model: string; operation: TScopeOperation }): void {
    const { model, operation } = opts;

    if (ScopeOperations.includes({ group: ScopeOperations.WRITE, operation })) {
      return;
    }

    throw getError({
      message: `[ScopeWriteGuard] the write guard runs for a write operation only | entity: ${model} | operation: ${operation}`,
    });
  }

  /**
   * A write to a `through` model named no parent, a parent that does not exist, or one outside the caller's scope. One
   * message for all three, so a foreign parent's existence does not leak.
   */
  static parentDenied(opts: { model: string; operation: TScopeOperation; column: string }) {
    return ScopeWriteGuard.denied({
      ...opts,
      detail: "the parent is missing or outside the caller's scope",
    });
  }

  /**
   * An upsert met a row holding its key that the caller may not update: outside the scope, or hidden by the default
   * filter. The row is left as it is; the refusal is the same one an out-of-scope write gets.
   */
  static conflictDenied(opts: { model: string }) {
    return ScopeWriteGuard.denied({
      model: opts.model,
      operation: ScopeOperations.UPDATE,
      detail: "the row holding this key is outside the caller's scope",
    });
  }

  /** Names the model and the column, never a value: the caller may be a request. */
  private static denied(opts: {
    model: string;
    operation: TScopeOperation;
    column?: string;
    detail: string;
  }) {
    const { model, operation, column, detail } = opts;

    return getError({
      statusCode: WRITE_DENIED_STATUS,
      messageCode: RepositoryErrorCodes.SCOPE_WRITE_DENIED,
      message: [
        `[${operation}] write refused by the access scope | entity: ${model}`,
        ...(column ? [`column: ${column}`] : []),
        detail,
      ].join(' | '),
    });
  }
}
