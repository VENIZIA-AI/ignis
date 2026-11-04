import type { TContext } from '@/base/controllers/common/types';
import { type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { type IRedisHelper } from '@venizia/ignis-helpers/core';
import type { Adapter } from 'casbin';
import type { Env } from 'hono';
import { type MiddlewareHandler } from 'hono';
import type { IAuthUser } from '../../../authenticate/common/types';
import type {
  CasbinEnforcerCachedDrivers,
  CasbinEnforcerModelDrivers,
  TAuthorizationDecision,
  TCasbinDomainMatchingFunction,
} from '../constants';
import type {
  IAuthorizationDomainSource,
  IAuthorizationRequest,
  IAuthorizationUser,
  TAuthorizationConditions,
  TAuthorizationDomainResolver,
} from './request';

/** What CasbinAuthorizationEnforcer.buildRules returns and evaluate consumes. */
export interface ICasbinRules {
  user: IAuthorizationUser;
  lines: string[];
}

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

/** Per-route check run before the enforcer. `deny` rejects the request, `allow` accepts it without consulting the enforcer, `abstain` passes to the next voter and then the enforcer. */
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

/** Per-route authorization requirement passed to `authorize()`. `allowedRoles` grants access to matching roles before voters and the enforcer run. */
export interface IAuthorizationSpec<E extends Env = Env, TAction = string, TResource = string> {
  action: TAction;
  resource: TResource;
  conditions?: TAuthorizationConditions;
  allowedRoles?: string[];
  voters?: TAuthorizationVoter<E, TAction, TResource>[];
  /** Optional per-route domain: declarative source OR a resolver method. Omitted → global resolver. */
  domain?: IAuthorizationDomainSource | TAuthorizationDomainResolver<E>;
}

/** Factory that turns an `IAuthorizationSpec` (and optional enforcer name) into a Hono middleware. */
export type TAuthorizeFn<E extends Env = Env, TAction = string, TResource = string> = (opts: {
  spec: IAuthorizationSpec<E, TAction, TResource>;
  enforcerName?: string;
}) => MiddlewareHandler;

/** Redis cache for a Casbin enforcer's per-user policy lines. `keyFn` returns the cache key for a user and must not return an empty string. */
export interface ICasbinEnforcerCachedRedis {
  driver: typeof CasbinEnforcerCachedDrivers.REDIS;
  options: {
    connection: IRedisHelper;
    expiresIn: number;
    keyFn: (opts: { user: IAuthorizationUser }) => ValueOrPromise<string>;
  };
}

/** Options of a Casbin enforcer: model source, policy cache, optional adapter, domain matching and enforcer pool sizing. */
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

  /** Domain-scoped RBAC model: requests become 4-token `(subject, domain, object, action)` and the enforcer registers the domain matcher (`keyMatch` on `g`) + resource matcher (`objectMatch`). A role assignment or grant declared at a parent domain (via a `g3` policy line, e.g. `Merchant_7 -> Organizer_3`) applies to every child domain - the adapter is what decides whether those edges exist. */
  isScoped?: boolean;

  /** Number of pooled enforcers (each request enforces on its own). Default 16. */
  poolSize?: number;

  /** Max ms to wait for a free pooled enforcer before failing closed. Default 5000. */
  poolAcquireTimeoutMs?: number;
}

/** Application-wide authorize options. `defaultDecision` applies when an enforcer abstains and when no enforcer is registered (a `deny` default then fails the request). */
export interface IAuthorizeOptions {
  defaultDecision: TAuthorizationDecision;
  alwaysAllowRoles?: string[];
  /** Fallback domain resolver used when a route's spec has no `domain`. */
  domainResolver?: TAuthorizationDomainResolver;
}
