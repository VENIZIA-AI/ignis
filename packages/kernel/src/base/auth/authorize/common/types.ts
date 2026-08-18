import type { IdType } from '@/base';
import type { TContext } from '@/base/controllers/common/types';
import { type TNullable, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { type IRedisHelper } from '@venizia/ignis-helpers/core';
import type { Adapter } from 'casbin';
import type { Env } from 'hono';
import { type MiddlewareHandler } from 'hono';
import type { IAuthUser } from '../../authenticate/common/types';
import type {
  CasbinEnforcerCachedDrivers,
  CasbinEnforcerModelDrivers,
  TAuthorizationAction,
  TAuthorizationDecision,
  TCasbinDomainMatchingFunction,
} from './constants';
import type { AuthorizationPolicyBuilder } from '../builders/policy.builder';
export interface IAuthorizationRole {
  readonly name: string;
  readonly priority: number;
  readonly identifier: string;
}

/** Key-value conditions for attribute-based access control. Values compared with strict equality. */
export type TAuthorizationConditions<
  KeyType extends string | symbol = string | symbol,
  ValueType = string | number | boolean | null,
> = Record<KeyType, ValueType>;

export interface IAuthorizationRequest<TAction = string, TResource = string> {
  action: TAction;
  resource: TResource;
  conditions?: TAuthorizationConditions;
  /** Resolved domain scope for this request as a casbin domain string `"<DomainType>_<id>"` (e.g. `"Merchant_7"`), or the `"SYSTEM_WIDE"` sentinel to enforce across all domains. */
  domain?: string;
}

export interface IAuthorizationUser extends IAuthUser {
  principalType: string;
}

/** What CasbinAuthorizationEnforcer.buildRules returns and evaluate consumes. */
export interface ICasbinRules {
  user: IAuthorizationUser;
  lines: string[];
}

/** Declarative description of where to read the request domain from. */
export interface IAuthorizationDomainSource {
  from: 'param' | 'header' | 'query' | 'context';
  key: string;
  type: string; // domain type, e.g. 'Merchant' | 'Organizer'
}

/** Returns the current request domain; null = no domain (→ SYSTEM_WIDE). */
export type TAuthorizationDomainResolver<E extends Env = Env> = (opts: {
  context: TContext<E, string>;
}) => ValueOrPromise<TNullable<{ type: string; id: IdType }>>;

/** Builds rules and evaluates requests. Cache management (`invalidateUserCache`/`rebuildUserCache`) is OPTIONAL - only on per-user-caching enforcers; the registry feature-detects it at runtime. */
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

  buildRules(opts: { user: IAuthorizationUser; context: TContext<E, string> }): TBuildRulesReturn;

  evaluate(opts: {
    rules: TRules;
    request: IAuthorizationRequest<TAction, TResource>;
    context: TContext<E, string>;
  }): TEvaluateReturn;

  /** Drop a user's cached policies. Implemented only by caching enforcers. */
  invalidateUserCache?(opts: { user: IAuthorizationUser }): Promise<{ invalidatedKeys: number }>;

  /** Drop + rebuild a user's cached policies. Implemented only by caching enforcers. */
  rebuildUserCache?(opts: {
    user: IAuthorizationUser;
  }): Promise<{ cacheKey: string; lineCount: number }>;
}

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
  /** Optional per-route domain: declarative source OR a resolver method. Omitted → global resolver. */
  domain?: IAuthorizationDomainSource | TAuthorizationDomainResolver<E>;
}

export type TAuthorizeFn<E extends Env = Env, TAction = string, TResource = string> = (opts: {
  spec: IAuthorizationSpec<E, TAction, TResource>;
  enforcerName?: string;
}) => MiddlewareHandler;

export interface ICasbinEnforcerCachedRedis {
  driver: typeof CasbinEnforcerCachedDrivers.REDIS;
  options: {
    connection: IRedisHelper;
    expiresIn: number;
    keyFn: (opts: { user: IAuthorizationUser }) => ValueOrPromise<string>;
  };
}

export interface ICasbinEnforcerOptions<
  E extends Env = Env,
  TAction = string,
  TResource = string,
  TAdapter = Adapter,
> {
  model:
    | { driver: typeof CasbinEnforcerModelDrivers.FILE; definition: string }
    | { driver: typeof CasbinEnforcerModelDrivers.TEXT; definition: string };
  cached: { use: false } | (ICasbinEnforcerCachedRedis & { use: true });
  adapter?: TAdapter;

  domainMatching?: {
    roleDefinition: string;
    fn: TCasbinDomainMatchingFunction;
  };

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

  /** Domain-scoped RBAC model: requests become 4-token `(subject, domain, object, action)` and the enforcer registers the domain matcher (`keyMatch` on `g`) + resource matcher (`objectMatch`). */
  isScoped?: boolean;

  /** Number of pooled enforcers (each request enforces on its own). Default 16. */
  poolSize?: number;

  /** Max ms to wait for a free pooled enforcer before failing closed. Default 5000. */
  poolAcquireTimeoutMs?: number;
}

export interface IAuthorizeOptions {
  defaultDecision: TAuthorizationDecision;
  alwaysAllowRoles?: string[];
  /** Fallback domain resolver used when a route's spec has no `domain`. */
  domainResolver?: TAuthorizationDomainResolver;
}

/** Shape of `PolicyDefinition.metadata` on a subset ("custom") grant. `ops` holds bare method names (e.g. `"find"`), not full permission codes. */
export type TCustomGrantMetadata = { ops: string[] };

export type TGrantIntent = { tier: TAuthorizationAction } | { ops: string[] };

/** Per-operation rows carry `targetId` = the operation's code, not a database id; the consumer resolves codes to ids when persisting. */
export type TPlannedGrantRow = ReturnType<typeof AuthorizationPolicyBuilder.grant> & {
  metadata?: { ops: string[] };
};
