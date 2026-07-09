import type { TContext } from '@/base/controllers/common/types';
import type { TNullable } from '@venizia/ignis-helpers';
import type { Env } from 'hono';
import { AuthorizationDomainScopes } from './constants';
import type { IAuthorizationDomainSource, IAuthorizationSpec, IAuthorizeOptions } from './types';

/** Read a domain value from a declarative source on the Hono context. */
export const readDeclarative = (opts: {
  source: IAuthorizationDomainSource;
  context: TContext<Env, string>;
}): TNullable<string> => {
  const { source, context } = opts;
  switch (source.from) {
    case 'param': {
      return context.req.param(source.key) ?? null;
    }
    case 'header': {
      return context.req.header(source.key) ?? null;
    }
    case 'query': {
      return context.req.query(source.key) ?? null;
    }
    case 'context': {
      const value = context.get(source.key as any);
      return value == null ? null : String(value);
    }
    default: {
      return null;
    }
  }
};

/**
 * Resolve the request domain scope with precedence:
 *   spec.domain (method | declarative) → options.domainResolver → SYSTEM_WIDE.
 * Returns a casbin domain string ("<type>_<id>") or the SYSTEM_WIDE sentinel.
 */
export const resolveRequestDomain = async (opts: {
  spec: IAuthorizationSpec;
  context: TContext<Env, string>;
  options: TNullable<IAuthorizeOptions>;
}): Promise<string> => {
  const { spec, context, options } = opts;

  // (1) spec.domain as a method
  if (typeof spec.domain === 'function') {
    const resolved = await spec.domain({ context });
    return resolved
      ? [resolved.type, resolved.id].join('_')
      : AuthorizationDomainScopes.SYSTEM_WIDE;
  }

  // (2) spec.domain as declarative
  if (spec.domain) {
    const id = readDeclarative({ source: spec.domain, context });
    return id ? [spec.domain.type, id].join('_') : AuthorizationDomainScopes.SYSTEM_WIDE;
  }

  // (3) global resolver
  const globalResolver = options?.domainResolver ?? null;
  if (globalResolver) {
    const resolved = await globalResolver({ context });
    return resolved
      ? [resolved.type, resolved.id].join('_')
      : AuthorizationDomainScopes.SYSTEM_WIDE;
  }

  // (4) nothing → SYSTEM_WIDE
  return AuthorizationDomainScopes.SYSTEM_WIDE;
};
