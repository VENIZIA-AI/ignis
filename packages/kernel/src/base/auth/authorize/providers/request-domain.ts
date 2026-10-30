import type { TContext } from '@/base/controllers/common/types';
import type { TNullable } from '@venizia/ignis-helpers/common';
import type { Env } from 'hono';
import { AuthorizationDomainScopes, AuthorizationDomainSources } from '../common/constants';
import type {
  IAuthorizationDomainSource,
  IAuthorizationSpec,
  IAuthorizeOptions,
} from '../common/types';

/** Reads the domain of an authorization check off the request. */
export class RequestDomainResolver {
  /** Read a domain value from a declarative source on the Hono context. */
  static readDeclarative(opts: {
    source: IAuthorizationDomainSource;
    context: TContext<Env, string>;
  }): TNullable<string> {
    const { source, context } = opts;
    switch (source.from) {
      case AuthorizationDomainSources.PARAM: {
        return context.req.param(source.key) ?? null;
      }
      case AuthorizationDomainSources.HEADER: {
        return context.req.header(source.key) ?? null;
      }
      case AuthorizationDomainSources.QUERY: {
        return context.req.query(source.key) ?? null;
      }
      case AuthorizationDomainSources.CONTEXT: {
        const value = context.get(source.key as any);
        return value == null ? null : String(value);
      }
      default: {
        return null;
      }
    }
  }

  /** Resolve the request domain, precedence spec.domain (method | declarative) -> options.domainResolver -> SYSTEM_WIDE, as a casbin domain string ("<type>_<id>") or the SYSTEM_WIDE sentinel. */
  static async resolveRequestDomain(opts: {
    spec: IAuthorizationSpec;
    context: TContext<Env, string>;
    options: TNullable<IAuthorizeOptions>;
  }): Promise<string> {
    const { spec, context, options } = opts;

    if (typeof spec.domain === 'function') {
      const resolved = await spec.domain({ context });
      return resolved
        ? [resolved.type, resolved.id].join('_')
        : AuthorizationDomainScopes.SYSTEM_WIDE;
    }

    if (spec.domain) {
      const id = RequestDomainResolver.readDeclarative({ source: spec.domain, context });
      return id ? [spec.domain.type, id].join('_') : AuthorizationDomainScopes.SYSTEM_WIDE;
    }

    const globalResolver = options?.domainResolver ?? null;
    if (globalResolver) {
      const resolved = await globalResolver({ context });
      return resolved
        ? [resolved.type, resolved.id].join('_')
        : AuthorizationDomainScopes.SYSTEM_WIDE;
    }

    return AuthorizationDomainScopes.SYSTEM_WIDE;
  }
}

/** @deprecated Use RequestDomainResolver.readDeclarative({ source, context }). Removed in 0.5. */
export const readDeclarative = (opts: {
  source: IAuthorizationDomainSource;
  context: TContext<Env, string>;
}): TNullable<string> => {
  return RequestDomainResolver.readDeclarative(opts);
};

/** @deprecated Use RequestDomainResolver.resolveRequestDomain({ spec, context, options }). Removed in 0.5. */
export const resolveRequestDomain = async (opts: {
  spec: IAuthorizationSpec;
  context: TContext<Env, string>;
  options: TNullable<IAuthorizeOptions>;
}): Promise<string> => {
  return RequestDomainResolver.resolveRequestDomain(opts);
};
