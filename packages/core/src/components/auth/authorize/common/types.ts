import { TContext } from '@/base/controllers/common/types';
import { TClass, ValueOrPromise } from '@venizia/ignis-helpers';
import { Env, type MiddlewareHandler } from 'hono';
import { IAuthUser } from '../../authenticate';
import { Authorization, TAuthorizationDecision, TPermissionEffect } from './constants';

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
 * @typeParam T - Value type for condition entries. Defaults to primitive types.
 *
 * @example
 * ```typescript
 * // Default — accepts primitives
 * conditions: { ownerId: currentUser.userId, level: 3 }
 *
 * // Narrowed — string-only conditions
 * const filter: TAuthorizationConditions<string> = { department: 'engineering' }
 * ```
 */
export type TAuthorizationConditions<T = string | number | boolean | null> = Record<string, T>;

// --------------------------------------------------------------------------------------------------------
// Permission Evaluation
// --------------------------------------------------------------------------------------------------------

export interface IPermissionRule {
  action: string;
  resource: string;
  effect: TPermissionEffect;
  conditions?: TAuthorizationConditions;
}

export interface IAbilityBuilder {
  allow(opts: { action: string; resource: string; conditions?: TAuthorizationConditions }): void;
  deny(opts: { action: string; resource: string; conditions?: TAuthorizationConditions }): void;
  build(): IPermissionRule[];
}

/**
 * Authorization enforcer that builds abilities and evaluates permissions.
 *
 * @typeParam TAbilities - The abilities type produced by `buildAbilities` and consumed by `evaluate`.
 *   - `DefaultAuthorizationEnforcer` → `IPermissionRule[]`
 *   - `CasbinAuthorizationEnforcer` → `IAuthUser`
 *
 * The default (`unknown`) allows the registry and options to work polymorphically.
 * Concrete enforcers should specify their abilities type for full type safety.
 *
 * @example
 * ```typescript
 * class MyEnforcer implements IAuthorizationEnforcer<IPermissionRule[]> { ... }
 * ```
 */
export interface IAuthorizationEnforcer<TAbilities = unknown> {
  name: string;
  configure?(): ValueOrPromise<void>;
  buildAbilities(opts: { user: IAuthUser; context: TContext }): ValueOrPromise<TAbilities>;
  evaluate(opts: {
    abilities: TAbilities;
    action: string;
    resource: string;
    conditions?: TAuthorizationConditions;
  }): boolean;
}

// --------------------------------------------------------------------------------------------------------
// Route-level Declaration
// --------------------------------------------------------------------------------------------------------

export type TAuthorizationVoter<E extends Env = Env> = (opts: {
  user: IAuthUser;
  action: string;
  resource: string;
  context: TContext<E, string>;
}) => ValueOrPromise<TAuthorizationDecision>;

export interface IAuthorizationSpec<E extends Env = Env> {
  action: string;
  resource: string;
  conditions?: TAuthorizationConditions;
  allowedRoles?: string[];
  voters?: TAuthorizationVoter<E>[];
}

// --------------------------------------------------------------------------------------------------------
// Authorize Function
// --------------------------------------------------------------------------------------------------------

export type TAuthorizeFn = (opts: {
  spec: IAuthorizationSpec;
  enforcerName?: string;
}) => MiddlewareHandler;

// --------------------------------------------------------------------------------------------------------
// Component-level Configuration
// --------------------------------------------------------------------------------------------------------

export interface IAuthorizeOptions {
  enforcer: TClass<IAuthorizationEnforcer>;
  defaultDecision?: TAuthorizationDecision;
  alwaysAllowRoles?: string[];

  defineAbilitiesFor?: (opts: { user: IAuthUser; builder: IAbilityBuilder }) => void;

  loadPermissions?: (opts: {
    user: IAuthUser;
    context: TContext;
  }) => ValueOrPromise<IPermissionRule[]>;

  normalizePayloadFn?: (opts: { user: IAuthUser; action: string; resource: string }) => {
    subject: string;
    resource: string;
    action: string;
  };

  casbinOptions?: {
    model: string;
    /** Casbin adapter instance (e.g. `FileAdapter`, `SequelizeAdapter`). Requires `casbin` peer dep. */
    adapter?: unknown;
    useFilteredPolicy?: boolean;
  };
}

// --------------------------------------------------------------------------------------------------------
// Hono Context Augmentation
// --------------------------------------------------------------------------------------------------------

declare module 'hono' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface ContextVariableMap {
    /** Cached abilities built by the enforcer's `buildAbilities()`. Type depends on enforcer. */
    [Authorization.ABILITIES]: unknown;
    [Authorization.SKIP_AUTHORIZATION]: boolean;
  }
}
