import { TContext } from '@/base/controllers/common/types';
import { type DefaultRedisHelper, type ValueOrPromise } from '@venizia/ignis-helpers';
import { type Adapter } from 'casbin';
import { Env, type MiddlewareHandler } from 'hono';
import { IAuthUser } from '../../authenticate';
import {
  CasbinEnforcerCachedDrivers,
  CasbinEnforcerModelDrivers,
  TAuthorizationDecision,
  TCasbinDomainMatchingFunction,
} from './constants';
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

export interface IAuthorizationComparable<TElement = string, TCompareResult = number> {
  value: TElement;
  compare(other: TElement): TCompareResult;
  isEqual(other: TElement): boolean;
}

export interface IAuthorizationRequest<TAction = string, TResource = string> {
  action: TAction;
  resource: TResource;
  conditions?: TAuthorizationConditions;
}

/** Authorization enforcer that builds rules and evaluates authorization requests. */
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

export type TAuthorizeFn<E extends Env = Env, TAction = string, TResource = string> = (opts: {
  spec: IAuthorizationSpec<E, TAction, TResource>;
  enforcerName?: string;
}) => MiddlewareHandler;

export interface ICasbinEnforcerCachedMemory {
  driver: typeof CasbinEnforcerCachedDrivers.IN_MEMORY;
  options: {
    expiresIn: number;
  };
}

export interface ICasbinEnforcerCachedRedis {
  driver: typeof CasbinEnforcerCachedDrivers.REDIS;
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
> {
  model:
    | { driver: typeof CasbinEnforcerModelDrivers.FILE; definition: string }
    | { driver: typeof CasbinEnforcerModelDrivers.TEXT; definition: string };
  cached:
    | { use: false }
    | (ICasbinEnforcerCachedMemory & { use: true })
    | (ICasbinEnforcerCachedRedis & { use: true });
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
}

export interface IAuthorizeOptions {
  defaultDecision: TAuthorizationDecision;
  alwaysAllowRoles?: string[];
}
