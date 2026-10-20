import type { IdType } from '@/base';
import type { TContext } from '@/base/controllers/common/types';
import { type TNullable, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Env } from 'hono';
import type { IAuthUser } from '../../../authenticate/common/types';

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
