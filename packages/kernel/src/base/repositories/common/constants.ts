import type { TConstValue } from '@venizia/ignis-helpers/common';
import { MessageCode } from '@venizia/ignis-helpers/core';

/** Default pagination limit for repository queries. */
export const DEFAULT_LIMIT = 10;

/**
 * Largest `limit` a caller may ask for when a model declares no `maxLimit`.
 *
 * POLICY, not capacity - it sits far below what an engine can physically serve. It exists because
 * removing an accidental guardrail without replacing it would leave the framework less safe than
 * before: a search engine refused a page over 250 hits, so `limit: 5000` failed fast and cheap.
 * Once that page is served, something has to decide when a page is unreasonable.
 *
 * 1000 sits above any list screen and well below the physical ceiling, so reaching it means the
 * caller is doing something unusual - and a model raises it by saying so explicitly.
 */
export const DEFAULT_MAX_LIMIT = 1000;

/** Defines the operation scope for repository instances (READ_ONLY, WRITE_ONLY, READ_WRITE). */
export class RepositoryOperationScopes {
  static readonly READ_ONLY = 'READ_ONLY';
  static readonly WRITE_ONLY = 'WRITE_ONLY';
  static readonly READ_WRITE = 'READ_WRITE';
  static readonly SCHEME_SET = new Set([this.READ_ONLY, this.WRITE_ONLY, this.READ_WRITE]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/** Valid repository operation scope values. */
export type TRepositoryOperationScope = TConstValue<typeof RepositoryOperationScopes>;

/** What a row-scope filter (`@model` settings.scopeFilter) does when `resolve()` returns null/undefined. */
export class ScopeFilterMissingBehaviors {
  /** An unresolved scope matches ZERO rows - the safe reading of "caller's scope is unknown". */
  static readonly DENY = 'deny';
  /** Explicit opt-out: no scope is applied. For migrations and background jobs, never inferred from a request. */
  static readonly ALLOW = 'allow';
  static readonly SCHEME_SET = new Set([this.DENY, this.ALLOW]);

  static isValid(behavior: string): boolean {
    return this.SCHEME_SET.has(behavior);
  }
}

/** Valid scope-filter missing-behavior values. */
export type TScopeFilterMissingBehavior = TConstValue<typeof ScopeFilterMissingBehaviors>;

/** Machine-readable codes for repository-level failures, in the dotted namespace core already uses (`core.not_supported`, `core.search_engine.*`) - a client maps the code, never the message. */
export class RepositoryErrorCodes {
  /** A verb the repository's `operationScope` does not permit (e.g. `create()` on a READ_ONLY one). */
  static readonly OPERATION_NOT_ALLOWED = MessageCode.build({
    parts: ['core', 'repository', 'operation_not_allowed'],
  });
}

/** Valid repository error code values. */
export type TRepositoryErrorCode = TConstValue<typeof RepositoryErrorCodes>;

/** Entity relation types (one-to-one/many-to-one, one-to-many). */
export class RelationTypes {
  static readonly ONE = 'one';
  static readonly MANY = 'many';
  static readonly SCHEME_SET = new Set([this.ONE, this.MANY]);

  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/** Valid relation type values. */
export type TRelationType = TConstValue<typeof RelationTypes>;

/** PostgreSQL row-level lock strengths for SELECT ... FOR <strength>. */
export class LockStrengths {
  static readonly UPDATE = 'update';
  static readonly NO_KEY_UPDATE = 'no key update';
  static readonly SHARE = 'share';
  static readonly KEY_SHARE = 'key share';
  static readonly SCHEME_SET = new Set([
    this.UPDATE,
    this.NO_KEY_UPDATE,
    this.SHARE,
    this.KEY_SHARE,
  ]);

  static isValid(strength: string): boolean {
    return this.SCHEME_SET.has(strength);
  }
}

/** Valid lock strength values. */
export type TLockStrength = TConstValue<typeof LockStrengths>;
