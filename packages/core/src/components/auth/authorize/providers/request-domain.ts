import type { TContext } from '@/base/controllers/common/types';
import type { TNullable } from '@venizia/ignis-helpers';
import type { Env } from 'hono';
import { AuthorizationDomainScopes } from '../common/constants';
import type {
  IAuthorizationDomainSource,
  IAuthorizationSpec,
  IAuthorizeOptions,
} from '../common/types';

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

/** Resolve the request domain, precedence spec.domain (method | declarative) -> options.domainResolver -> SYSTEM_WIDE, as a casbin domain string ("<type>_<id>") or the SYSTEM_WIDE sentinel. */
export const resolveRequestDomain = async (opts: {
  spec: IAuthorizationSpec;
  context: TContext<Env, string>;
  options: TNullable<IAuthorizeOptions>;
}): Promise<string> => {
  const { spec, context, options } = opts;

  if (typeof spec.domain === 'function') {
    const resolved = await spec.domain({ context });
    return resolved
      ? [resolved.type, resolved.id].join('_')
      : AuthorizationDomainScopes.SYSTEM_WIDE;
  }

  if (spec.domain) {
    const id = readDeclarative({ source: spec.domain, context });
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
};
