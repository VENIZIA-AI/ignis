import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { BindingKeys } from '@venizia/ignis-inversion';
import type { Env } from 'hono';
import {
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationErrors,
  BindingNamespaces,
  ServiceAssertion,
  inject,
} from '@venizia/ignis-kernel';
import type {
  IAuthUser,
  IAuthenticationStrategy,
  IServiceAuthOptions,
  TContext,
} from '@venizia/ignis-kernel';
import { ServiceAssertionVerifierService } from '../services/service/verifier.service';

/**
 * Proves the CALLING SERVICE, from a per-request Ed25519 assertion verified against that caller's
 * own JWKS. No identity round trip and no shared password.
 *
 * It proves which service called, never which user. `resolvePrincipal` is where the application
 * turns a caller name into one of its own principals.
 */
export class ServiceAuthenticationStrategy<E extends Env = Env>
  extends BaseHelper
  implements IAuthenticationStrategy<E>
{
  name = Authentication.STRATEGY_SERVICE;

  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: ServiceAssertionVerifierService.name,
      }),
    })
    private readonly verifier: ServiceAssertionVerifierService,
    @inject({ key: AuthenticateBindingKeys.SERVICE_OPTIONS })
    private readonly options: IServiceAuthOptions<E>,
  ) {
    super({ scope: ServiceAuthenticationStrategy.name });
  }

  async authenticate(context: TContext<E, string>): Promise<IAuthUser> {
    const token = context.req.header(ServiceAssertion.HEADER);

    if (!token) {
      throw getError({ error: AuthenticationErrors.ASSERTION_MISSING });
    }

    // The raw url, NOT `context.req.path`: Hono hands that back percent-DECODED, so a route carrying
    // a space or a non-ASCII slug would never match the encoded path the caller signed.
    const { issuer } = await this.verifier.verify({
      token,
      method: context.req.method,
      path: new URL(context.req.url).pathname,
    });

    const principal = await this.options.resolvePrincipal({ issuer, context });

    // Validated rather than trusted. The provider also refuses an answer without a `userId`, but a principal an
    // application resolves wrongly is reported here, at the cause, with the issuer and the strategy named.
    if (!principal?.userId) {
      this.logger
        .for(this.authenticate.name)
        .warn('resolvePrincipal returned no usable principal | iss: %s', issuer);
      throw getError({ error: AuthenticationErrors.PRINCIPAL_UNRESOLVED });
    }

    // Which service called is audit-relevant even when the principal is shared across callers.
    return { ...principal, callerService: issuer };
  }
}
