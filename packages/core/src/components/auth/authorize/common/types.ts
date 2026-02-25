import { TContext } from '@/base/controllers/common/types';
import { type DefaultRedisHelper, type ValueOrPromise } from '@venizia/ignis-helpers';
import { type Adapter } from 'casbin';
import { Env, type MiddlewareHandler } from 'hono';
import { IAuthUser } from '../../authenticate';
import { TAuthorizationDecision } from './constants';

// --------------------------------------------------------------------------------------------------------
// Foundational Types
// --------------------------------------------------------------------------------------------------------

export interface IAuthorizationRole {
  readonly name: string;
  readonly priority: number;
  readonly identifier: string;
}

/**
 * Key-value conditions for attribute-based access control.
 * Values are compared with strict equality (`===`).
 *
 * @typeParam KeyType - Key type for condition entries. Defaults to `string | symbol`.
 * @typeParam ValueType - Value type for condition entries. Defaults to primitive types.
 *
 * @example
 * ```typescript
 * // Default — accepts primitives
 * conditions: { ownerId: currentUser.userId, level: 3 }
 *
 * // Narrowed — string keys, string values
 * const filter: TAuthorizationConditions<string, string> = { department: 'engineering' }
 * ```
 */
export type TAuthorizationConditions<
  KeyType extends string | symbol = string | symbol,
  ValueType = string | number | boolean | null,
> = Record<KeyType, ValueType>;

// --------------------------------------------------------------------------------------------------------
// Authorization Comparable
// --------------------------------------------------------------------------------------------------------

export interface IAuthorizationComparable<TElement = string, TCompareResult = number> {
  value: TElement;
  compare(other: TElement): TCompareResult;
  isEqual(other: TElement): boolean;
}

// --------------------------------------------------------------------------------------------------------
// Authorization Evaluation
// --------------------------------------------------------------------------------------------------------

export interface IAuthorizationRequest<TAction = string, TResource = string> {
  action: TAction;
  resource: TResource;
  conditions?: TAuthorizationConditions;
}

/**
 * Authorization enforcer that builds rules and evaluates authorization requests.
 *
 * @typeParam E - Hono `Env` type for typed context access (default: `Env`).
 * @typeParam TAction - Action type (default: `string`). Use `IAuthorizationComparable` for custom comparison.
 * @typeParam TResource - Resource type (default: `string`). Use `IAuthorizationComparable` for custom comparison.
 * @typeParam TRules - The rules type produced by `buildRules` and consumed by `evaluate`.
 *   - `CasbinAuthorizationEnforcer` → `IAuthUser`
 * @typeParam TBuildRulesReturn - Return type of `buildRules` (default: `ValueOrPromise<TRules>`).
 * @typeParam TEvaluateReturn - Return type of `evaluate` (default: `ValueOrPromise<TAuthorizationDecision>`).
 *
 * @example
 * ```typescript
 * class MyEnforcer implements IAuthorizationEnforcer<Env, string, string, unknown> { ... }
 * ```
 */
export interface IAuthorizationEnforcer<
  E extends Env = Env,
  TAction = string,
  TResource = string,
  TRules = unknown,
  TBuildRulesReturn = ValueOrPromise<TRules>,
  TEvaluateReturn = ValueOrPromise<TAuthorizationDecision>,
> {
  name: string;

  configure(): ValueOrPromise<void>;

  buildRules(opts: {
    user: { principalType: string } & IAuthUser;
    context: TContext<E, string>;
  }): TBuildRulesReturn;

  evaluate(opts: {
    rules: TRules;
    request: IAuthorizationRequest<TAction, TResource>;
    context: TContext<E, string>;
  }): TEvaluateReturn;
}

// --------------------------------------------------------------------------------------------------------
// Route-level Declaration
// --------------------------------------------------------------------------------------------------------

export type TAuthorizationVoter<
  E extends Env = Env,
  TAction = string,
  TResource = string,
> = (opts: {
  user: IAuthUser;
  action: TAction;
  resource: TResource;
  context: TContext<E, string>;
}) => ValueOrPromise<TAuthorizationDecision>;

export interface IAuthorizationSpec<E extends Env = Env, TAction = string, TResource = string> {
  action: TAction;
  resource: TResource;
  conditions?: TAuthorizationConditions;
  allowedRoles?: string[];
  voters?: TAuthorizationVoter<E, TAction, TResource>[];
}

// --------------------------------------------------------------------------------------------------------
// Authorize Function
// --------------------------------------------------------------------------------------------------------

export type TAuthorizeFn<E extends Env = Env, TAction = string, TResource = string> = (opts: {
  spec: IAuthorizationSpec<E, TAction, TResource>;
  enforcerName?: string;
}) => MiddlewareHandler;

// --------------------------------------------------------------------------------------------------------
// Component-level Configuration
// --------------------------------------------------------------------------------------------------------

export interface ICommonEnforcerOptions {
  name: string;
}

export interface ICasbinEnforcerCachedMemory {
  driver: 'in-memory';
  options: {
    expiresIn: number;
  };
}

export interface ICasbinEnforcerCachedRedis {
  driver: 'redis';
  options: {
    connection: DefaultRedisHelper;
    expiresIn: number;
    keyFn: (opts: { user: { principalType: string } & IAuthUser }) => ValueOrPromise<string>;
  };
}

export interface ICasbinEnforcerOptions<
  E extends Env = Env,
  TAction = string,
  TResource = string,
  TAdapter = Adapter,
> extends ICommonEnforcerOptions {
  model: string;
  cached:
    | { use: false }
    | (ICasbinEnforcerCachedMemory & { use: true })
    | (ICasbinEnforcerCachedRedis & { use: true });
  adapter?: TAdapter;
  useFilteredPolicy?: boolean;
  normalizePayloadFn?(opts: {
    user: IAuthUser;
    action: TAction;
    resource: TResource;
    context: TContext<E, string>;
  }): {
    subject: string;
    resource: string;
    action: string;
    domain?: string;
  };
}

export interface IAuthorizeOptions<E extends Env = Env, TAction = string, TResource = string> {
  defaultDecision: TAuthorizationDecision;
  alwaysAllowRoles?: string[];

  enforcers?: {
    casbin?: ICasbinEnforcerOptions<E, TAction, TResource>;
  };
}
