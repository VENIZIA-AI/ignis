import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { AuthenticateComponent } from '@/components/auth/authenticate/component';
import { JWKSVerifierTokenService } from '@/components/auth/authenticate/services/bearer/jwks/verifier.service';
import { JoseLoader } from '@/components/auth/authenticate/services/jose-loader';
import { JWKSUrlPolicy } from '@/components/auth/authenticate/services/jwks-url-policy';
import { ServiceAssertionVerifierService } from '@/components/auth/authenticate/services/service/verifier.service';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  AuthenticateBindingKeys,
  JOSEStandards,
  JWKSModes,
  type IApplicationConfigs,
  type IApplicationInfo,
  type IServiceAuthOptions,
  type TJWTTokenServiceOptions,
} from '@venizia/ignis-kernel';
import { describe, expect, test } from 'bun:test';

/**
 * A JWKS is fetched over `https:`, or over `http:` from a loopback host or an origin named in `jwks.trusted`.
 * The JWKS verifier and the service-assertion callers share the one policy. The shape of an origin entry is the url
 * guard's own (`UrlPolicy.resolveTrustedOrigins`); its refusals are tested in the helpers package, a few are repeated here
 * because the boot has to surface them.
 */

const SCOPE = 'probe';

const refusal = (task: () => unknown): string => {
  try {
    task();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected a refusal');
};

const assertUrl = (url: string, trusted?: unknown) =>
  JWKSUrlPolicy.assertUrl({ scope: SCOPE, label: 'jwksUrl', url, trusted });

describe('JWKSUrlPolicy.assertUrl', () => {
  test.each([
    'https://identity.example.com/certs',
    'https://identity-service:8443/certs',
    'http://localhost/certs',
    'http://localhost:3000/certs',
    'http://127.0.0.1:3000/certs',
    'http://127.12.0.9/certs',
    'http://[::1]:3000/certs',
    'HTTP://LOCALHOST:3000/certs',
    'http://2130706433/certs',
    'http://0177.0.0.1/certs',
  ])('%s is accepted with no list', (url) => {
    expect(assertUrl(url).href).toBe(new URL(url).href);
  });

  test.each([
    'http://identity-service/certs',
    'http://identity-service:3000/certs',
    'http://identity.example.com/certs',
    'http://10.0.0.5:3000/certs',
    'http://128.0.0.1/certs',
    'http://localhost.evil.example/certs',
    'http://[::2]/certs',
    'http://[::ffff:127.0.0.1]/certs',
    'http://[fe80::1]/certs',
    'http://167772161/certs',
  ])('%s is refused with no list, naming the origin and the key to set', (url) => {
    const message = refusal(() => assertUrl(url));

    expect(message).toContain('uses http:');
    expect(message).toContain('jwks.trusted');
    expect(message).toContain(`'${new URL(url).origin}'`);
  });

  test('a listed origin is accepted over http, and only that origin', () => {
    const trusted = ['http://identity-service', 'http://10.0.0.5:8080', 'http://[fd00::1]:8443'];

    expect(() => assertUrl('http://identity-service/certs', trusted)).not.toThrow();
    expect(() => assertUrl('http://IDENTITY-SERVICE:80/certs', trusted)).not.toThrow();
    expect(() => assertUrl('http://10.0.0.5:8080/certs', trusted)).not.toThrow();
    expect(() => assertUrl('http://[fd00::1]:8443/certs', trusted)).not.toThrow();
    expect(() => assertUrl('http://[FD00:0:0:0:0:0:0:1]:8443/certs', trusted)).not.toThrow();
  });

  test.each([
    'http://identity-service:3000/certs',
    'http://identity-service.evil.example/certs',
    'http://evil-identity-service/certs',
    'http://identity-service@evil.example/certs',
    'http://evil.example#@identity-service/certs',
    'http://evil.example/@identity-service',
    'http://identity-service./certs',
    'http://other-service/certs',
    'http://10.0.0.5/certs',
    'http://10.0.0.5:8081/certs',
    'http://10.0.0.50:8080/certs',
    'http://[::ffff:10.0.0.5]:8080/certs',
    'http://[fd00::1]:9000/certs',
  ])('%s is not covered by the listed origins (exact scheme, host and port)', (url) => {
    const trusted = ['http://identity-service', 'http://10.0.0.5:8080', 'http://[fd00::1]:8443'];

    expect(refusal(() => assertUrl(url, trusted))).toContain('is not trusted');
  });

  test('each port is its own entry: one without a port is port 80, not every port', () => {
    expect(() =>
      assertUrl('http://identity-service:80/certs', ['http://identity-service']),
    ).not.toThrow();
    expect(
      refusal(() => assertUrl('http://identity-service:9/certs', ['http://identity-service'])),
    ).toContain('is not trusted');
    expect(() =>
      assertUrl('http://identity-service:9/certs', ['http://identity-service:9']),
    ).not.toThrow();
  });

  test('a listed https origin changes nothing: https needs no entry, and http to that host is another origin', () => {
    expect(() =>
      assertUrl('https://anything.example/certs', ['http://identity-service']),
    ).not.toThrow();
    expect(
      refusal(() => assertUrl('http://cdn.example.com/certs', ['https://cdn.example.com'])),
    ).toContain('is not trusted');
  });

  test('an entry never turns another scheme on', () => {
    expect(
      refusal(() => assertUrl('ftp://identity-service/certs', ['http://identity-service'])),
    ).toContain('must use https');
  });

  test.each([
    'file:///etc/passwd',
    'ftp://example.com/certs',
    'javascript:alert(1)',
    'ws://localhost/certs',
  ])('the scheme of %s is refused', (url) => {
    expect(refusal(() => assertUrl(url))).toContain('must use https');
  });

  test('an https URL still refuses a bad jwks.trusted list', () => {
    expect(refusal(() => assertUrl('https://identity.example.com/certs', ['garbage']))).toContain(
      'jwks.trusted holds',
    );
  });

  test('a string that is not a URL is refused, naming the key', () => {
    const message = refusal(() => assertUrl('not a url'));

    expect(message).toContain('jwksUrl is not a valid URL');
    expect(message).not.toContain('not a url');
  });

  test('a refusal never carries the credentials of the URL', () => {
    const message = refusal(() => assertUrl('http://admin:hunter2@evil.example/certs'));

    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('admin');
    expect(message).toContain('evil.example');
  });

  test.each([
    'http://10.0.0.5:0/certs',
    'http://identity-service:0/certs',
    'http://127.0.0.1:0/certs',
    'http://[fd00::1]:0/certs',
  ])('%s (port 0) is refused, whatever the entries', (url) => {
    const message = refusal(() =>
      assertUrl(url, ['http://10.0.0.5', 'http://identity-service', 'http://[fd00::1]']),
    );

    expect(message).toContain('uses port 0');
  });

  test('loopback stays allowed with an unrelated entry, which never opens another host', () => {
    expect(() => assertUrl('http://127.0.0.1:3000/certs', ['http://10.0.0.5'])).not.toThrow();
    expect(refusal(() => assertUrl('http://10.0.0.6/certs', ['http://10.0.0.5']))).toContain(
      'is not trusted',
    );
  });
});

describe('JWKSUrlPolicy.resolveTrustedOrigins', () => {
  test('an unset list is an empty one, and the origins are kept as written', () => {
    expect(JWKSUrlPolicy.resolveTrustedOrigins({ scope: SCOPE }).size).toBe(0);
    expect([
      ...JWKSUrlPolicy.resolveTrustedOrigins({
        scope: SCOPE,
        trusted: ['http://identity-service', 'http://10.0.0.5:8080', 'http://[fd00::1]:8443'],
      }),
    ]).toEqual(['http://identity-service', 'http://10.0.0.5:8080', 'http://[fd00::1]:8443']);
  });

  test.each([
    ['a bare host', 'identity-service'],
    ['the old host:port form', '10.0.0.5:8080'],
    ['a path', 'http://identity-service/certs'],
    ['a trailing slash', 'http://identity-service/'],
    ['credentials', 'http://user@identity-service'],
    ['upper case', 'http://Identity-Service'],
    ['a wildcard', 'http://*.internal'],
    ['a range', 'http://10.0.0.0/8'],
    ['a decimal address', 'http://2130706433'],
    ['an IPv4-mapped IPv6 address', 'http://[::ffff:10.0.0.5]'],
    ['the default port', 'http://identity-service:80'],
    ['port zero', 'http://identity-service:0'],
    ['the unspecified address', 'http://0.0.0.0'],
    ['another scheme', 'ftp://identity-service'],
    ['a number', 5],
    ['null', null],
  ])('an entry with %s is refused, naming the entry', (_name, entry) => {
    const message = refusal(() =>
      JWKSUrlPolicy.resolveTrustedOrigins({ scope: SCOPE, trusted: [entry] }),
    );

    expect(message).toContain('jwks.trusted holds');
    expect(message).toContain(JSON.stringify(entry));
  });

  test('a list that is not a list is refused', () => {
    expect(
      refusal(() => JWKSUrlPolicy.resolveTrustedOrigins({ scope: SCOPE, trusted: 'identity' })),
    ).toContain('must be a list');
  });
});

const CONFIGS: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

class ProbeApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'jwks-hosts', version: '0.0.0', description: 'jwks hosts probe' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}

const verifier = (overrides?: Record<string, unknown>) =>
  ({
    standard: JOSEStandards.JWKS,
    options: {
      mode: JWKSModes.VERIFIER,
      jwksUrl: 'https://identity.example.com/certs',
      claims: { issuer: 'identity', audience: 'inventory' },
      verify: { algorithms: ['ES256'] },
      ...overrides,
    },
  }) as unknown as TJWTTokenServiceOptions;

const service = (overrides?: Record<string, unknown>): IServiceAuthOptions =>
  ({
    name: 'inventory',
    resolvePrincipal: () => ({ userId: 'svc' }),
    callers: { commerce: 'https://commerce.example.com/svc-certs' },
    ...overrides,
  }) as IServiceAuthOptions;

const boot = async (opts: {
  jwtOptions?: TJWTTokenServiceOptions;
  serviceOptions?: IServiceAuthOptions;
}): Promise<string | null> => {
  const application = new ProbeApplication({ scope: ProbeApplication.name, config: CONFIGS });
  application.init();

  if (opts.jwtOptions) {
    application
      .bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS })
      .toValue(opts.jwtOptions);
  }

  if (opts.serviceOptions) {
    application
      .bind<IServiceAuthOptions>({ key: AuthenticateBindingKeys.SERVICE_OPTIONS })
      .toValue(opts.serviceOptions);
  }

  application.component(AuthenticateComponent);

  try {
    await application.initialize();
  } catch (error) {
    return error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error);
  }

  return null;
};

describe('the JWKS verifier configuration', () => {
  test('an https URL boots', async () => {
    const result = await boot({ jwtOptions: verifier() });
    expect(result).toBeNull();
  });

  test('an http URL to an origin that is not trusted refuses to boot', async () => {
    const message = await boot({
      jwtOptions: verifier({ jwksUrl: 'http://identity-service:3000/certs' }),
    });

    expect(message).toContain('uses http:');
    expect(message).toContain('jwks.trusted');
  });

  test('an http URL to an origin named in jwks.trusted boots', async () => {
    const jwtOptions = verifier({
      jwksUrl: 'http://identity-service:3000/certs',
      jwks: { trusted: ['http://identity-service:3000'] },
    });

    const result2 = await boot({ jwtOptions });
    expect(result2).toBeNull();
  });

  test('an http URL to loopback boots', async () => {
    const result3 = await boot({
      jwtOptions: verifier({ jwksUrl: 'http://127.0.0.1:3000/certs' }),
    });
    expect(result3).toBeNull();
  });

  test('an origin entry with a port boots a URL on that port', async () => {
    const jwtOptions = verifier({
      jwksUrl: 'http://identity-service:3000/certs',
      jwks: { trusted: ['http://identity-service:3000'] },
    });

    const result4 = await boot({ jwtOptions });
    expect(result4).toBeNull();
  });

  test('an IP origin with a port boots, and the same IP on another port refuses to boot', async () => {
    const trusted = ['http://10.0.0.5:8080' as const];

    const listedPort = await boot({
      jwtOptions: verifier({ jwksUrl: 'http://10.0.0.5:8080/certs', jwks: { trusted } }),
    });
    const otherPort = await boot({
      jwtOptions: verifier({ jwksUrl: 'http://10.0.0.5:9090/certs', jwks: { trusted } }),
    });

    expect(listedPort).toBeNull();
    expect(otherPort).toContain('is not trusted');
  });

  test('an entry that is not an exact origin refuses to boot', async () => {
    const jwtOptions = verifier({
      jwksUrl: 'http://10.0.0.5:3000/certs',
      jwks: { trusted: ['http://10.0.0.0/8'] },
    });

    const result5 = await boot({ jwtOptions });
    expect(result5).toContain('jwks.trusted');
  });
});

describe('the service-assertion callers', () => {
  test('https callers boot', async () => {
    const result = await boot({ serviceOptions: service() });
    expect(result).toBeNull();
  });

  test('an http caller to an origin that is not trusted refuses to boot, naming the caller', async () => {
    const message = await boot({
      serviceOptions: service({ callers: { commerce: 'http://commerce:3000/svc-certs' } }),
    });

    expect(message).toContain('callers["commerce"].jwksUrl');
    expect(message).toContain('jwks.trusted');
  });

  test('the object form of a caller is checked the same way', async () => {
    const message = await boot({
      serviceOptions: service({
        callers: {
          commerce: { jwksUrl: 'http://commerce:3000/svc-certs', acceptMaxAgeSeconds: 60 },
        },
      }),
    });

    expect(message).toContain('uses http:');
  });

  test('callers on origins named in jwks.trusted boot', async () => {
    const serviceOptions = service({
      callers: {
        commerce: 'http://commerce:3000/svc-certs',
        billing: 'http://billing:8080/svc-certs',
        local: 'http://localhost:3001/svc-certs',
      },
      jwks: { trusted: ['http://commerce:3000', 'http://billing:8080'] },
    });

    const result2 = await boot({ serviceOptions });
    expect(result2).toBeNull();
  });

  test('a bad jwks.trusted refuses the boot although every URL is https', async () => {
    const result = await boot({ serviceOptions: service({ jwks: { trusted: ['garbage'] } }) });
    const verifierResult = await boot({ jwtOptions: verifier({ jwks: { trusted: ['garbage'] } }) });

    expect(result).toContain('jwks.trusted holds');
    expect(verifierResult).toContain('jwks.trusted holds');
  });

  test('a list entry that is not an origin refuses to boot even with no http caller', async () => {
    const serviceOptions = service({ jwks: { trusted: ['http://*.internal'] } });

    const result3 = await boot({ serviceOptions });
    expect(result3).toContain('jwks.trusted');
  });
});

describe('the second check, before each fetch', () => {
  test('a JWKS verifier built with a URL the policy refuses fails at its first use, naming the host', async () => {
    const jwksService = new JWKSVerifierTokenService({
      mode: 'verifier',
      jwksUrl: 'http://identity-service:3000/certs',
      claims: { issuer: 'identity', audience: 'inventory' },
      verify: { algorithms: ['ES256'] },
    } as never);
    const token = 'eyJhbGciOiJFUzI1NiJ9.e30.c2ln';

    let caught: { cause?: unknown } | undefined;

    try {
      await jwksService.verify({ type: 'Bearer', token });
    } catch (error) {
      caught = error as { cause?: unknown };
    }

    expect(String(caught?.cause)).toContain(
      "the origin 'http://identity-service:3000' is not trusted",
    );
  });

  test('the service-assertion verifier refuses a caller URL the policy refuses, before any fetch', async () => {
    const jose = await JoseLoader.load();
    const assertionVerifier = new ServiceAssertionVerifierService({
      name: 'inventory',
      callers: { commerce: 'http://commerce:3000/svc-certs' },
      resolvePrincipal: () => ({ userId: 'svc' }),
    } as never);

    const message = refusal(() => assertionVerifier['resolveKeySet']({ issuer: 'commerce', jose }));

    expect(message).toContain("the origin 'http://commerce:3000' is not trusted");
  });

  test('the same URL passes it when the origin is listed', async () => {
    const jose = await JoseLoader.load();
    const listedVerifier = new ServiceAssertionVerifierService({
      name: 'inventory',
      callers: { commerce: 'http://commerce:3000/svc-certs' },
      jwks: { trusted: ['http://commerce:3000'] },
      resolvePrincipal: () => ({ userId: 'svc' }),
    } as never);

    expect(() => listedVerifier['resolveKeySet']({ issuer: 'commerce', jose })).not.toThrow();
  });
});
