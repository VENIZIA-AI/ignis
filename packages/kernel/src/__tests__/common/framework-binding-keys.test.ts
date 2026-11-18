/**
 * The framework's own keys are typed (#1242) and every key string is exactly what it was: an application, a test or a
 * custom service binds and injects them by string. The `@ts-expect-error` lines pin the types.
 */

import { describe, expect, test } from 'bun:test';
import { AuthenticateBindingKeys } from '@/base/auth/authenticate/common/keys';
import { JOSEStandards } from '@/base/auth/authenticate/common/constants';
import { AuthorizeBindingKeys } from '@/base/auth/authorize/common/constants/binding-keys';
import { RestBindingKeys } from '@/base/components/controller/rest/common/types';
import { Container } from '@/helpers/inversion';
import type {
  IJWKSIssuerOptions,
  IJWKSVerifierOptions,
  IJWSTokenServiceOptions,
  TJWTTokenServiceOptions,
} from '@/base/auth/authenticate/common/types/jwt';
import type { IAuthorizeOptions } from '@/base/auth/authorize/common/types/enforcer';

describe('the kernel binding keys keep their strings', () => {
  test.each([
    [AuthenticateBindingKeys.REST_OPTIONS, '@app/authenticate/rest-options'],
    [AuthenticateBindingKeys.JWT_OPTIONS, '@app/authenticate/jwt-options'],
    [AuthenticateBindingKeys.BASIC_OPTIONS, '@app/authenticate/basic-options'],
    [AuthenticateBindingKeys.SERVICE_OPTIONS, '@app/authenticate/service-options'],
    [AuthenticateBindingKeys.SERVICE_CERTS_PATH, '@app/authenticate/service-certs-path'],
    [AuthorizeBindingKeys.OPTIONS, '@app/authorize/options'],
    [AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES, '@app/authorize/always-allow-roles'],
    [AuthorizeBindingKeys.enforcerOptions('casbin'), '@app/authorize/enforcers/casbin/options'],
    [RestBindingKeys.REST_COMPONENT_OPTIONS, '@app/rest/options'],
  ])('%s', (key, expected) => {
    expect(key).toBe(expected);
  });
});

describe('the JWT keys each name one type', () => {
  test('the app-bound key is the wrapper; the internal keys are the inner options, under new strings', () => {
    expect(AuthenticateBindingKeys.JWS_OPTIONS).toBe('@app/authenticate/jws-options');
    expect(AuthenticateBindingKeys.JWKS_ISSUER_OPTIONS).toBe(
      '@app/authenticate/jwks-issuer-options',
    );
    expect(AuthenticateBindingKeys.JWKS_VERIFIER_OPTIONS).toBe(
      '@app/authenticate/jwks-verifier-options',
    );
    expect('JWKS_OPTIONS' in AuthenticateBindingKeys).toBe(false);
  });

  test('each key reads and checks its own type', () => {
    const container = new Container();

    container.bind({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      standard: JOSEStandards.JWS,
      options: {} as IJWSTokenServiceOptions,
    } as TJWTTokenServiceOptions);
    container
      .bind({ key: AuthenticateBindingKeys.JWS_OPTIONS })
      .toValue({} as IJWSTokenServiceOptions);
    container
      .bind({ key: AuthenticateBindingKeys.JWKS_ISSUER_OPTIONS })
      .toValue({} as IJWKSIssuerOptions);
    container
      .bind({ key: AuthenticateBindingKeys.JWKS_VERIFIER_OPTIONS })
      .toValue({} as IJWKSVerifierOptions);

    const wrapper: TJWTTokenServiceOptions = container.get({
      key: AuthenticateBindingKeys.JWT_OPTIONS,
    });
    const inner: IJWSTokenServiceOptions = container.get({
      key: AuthenticateBindingKeys.JWS_OPTIONS,
    });

    const wrapperBinding = new Container().bind({ key: AuthenticateBindingKeys.JWT_OPTIONS });
    const issuerBinding = new Container().bind({
      key: AuthenticateBindingKeys.JWKS_ISSUER_OPTIONS,
    });
    // @ts-expect-error the inner options are not the wrapper
    wrapperBinding.toValue({} as IJWSTokenServiceOptions);
    // @ts-expect-error a verifier's options are not an issuer's
    issuerBinding.toValue({} as IJWKSVerifierOptions);

    expect(wrapper).toBeDefined();
    expect(inner).toBeDefined();
  });
});

describe('a typed framework key reads its type with no generic', () => {
  test('SERVICE_CERTS_PATH is a string, ALWAYS_ALLOW_ROLES a list, OPTIONS the authorize options', () => {
    const container = new Container();

    container.bind({ key: AuthenticateBindingKeys.SERVICE_CERTS_PATH }).toValue('/certs');
    container.bind({ key: AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES }).toValue(['admin']);
    const rejecting = new Container();
    // @ts-expect-error a number is not a path
    rejecting.bind({ key: AuthenticateBindingKeys.SERVICE_CERTS_PATH }).toValue(5);
    // @ts-expect-error roles are strings
    rejecting.bind({ key: AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES }).toValue([1]);

    const path: string = container.get({ key: AuthenticateBindingKeys.SERVICE_CERTS_PATH });
    const roles: string[] = container.get({ key: AuthorizeBindingKeys.ALWAYS_ALLOW_ROLES });
    const options: IAuthorizeOptions | undefined = container.get({
      key: AuthorizeBindingKeys.OPTIONS,
      isOptional: true,
    });

    expect(path).toBe('/certs');
    expect(roles).toEqual(['admin']);
    expect(options).toBeUndefined();
  });

  test('enforcerOptions takes the enforcer type as its argument', () => {
    const container = new Container();
    const key = AuthorizeBindingKeys.enforcerOptions<{ model: string }>('casbin');

    container.bind({ key }).toValue({ model: 'rbac' });

    const options: { model: string } = container.get({ key });

    expect(options.model).toBe('rbac');
  });
});
