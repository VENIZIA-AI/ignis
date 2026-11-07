import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import { AuthenticateComponent } from '@/components/auth/authenticate/component';
import { JWKSUrlPolicy } from '@/components/auth/authenticate/services/jwks-url-policy';
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
 * A JWKS is fetched over `https:`, or over `http:` from a loopback host or a host named in `jwks.hosts.http`.
 * The JWKS verifier and the service-assertion callers share the one policy.
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

const assertUrl = (url: string, hosts?: unknown) =>
  JWKSUrlPolicy.assertUrl({ scope: SCOPE, label: 'jwksUrl', url, hosts });

describe('JWKSUrlPolicy.assertUrl', () => {
  test.each([
    'https://identity.example.com/certs',
    'https://identity-service:8443/certs',
    'http://localhost/certs',
    'http://localhost:3000/certs',
    'http://127.0.0.1:3000/certs',
    'http://127.12.0.9/certs',
    'http://[::1]:3000/certs',
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
  ])('%s is refused with no list, naming the host and the key to set', (url) => {
    const message = refusal(() => assertUrl(url));

    expect(message).toContain('uses http:');
    expect(message).toContain('jwks.hosts.http');
  });

  test('a listed host name is accepted over http, on any port, in any case', () => {
    const hosts = ['Identity-Service'];

    expect(() => assertUrl('http://identity-service/certs', hosts)).not.toThrow();
    expect(() => assertUrl('http://identity-service:3000/certs', hosts)).not.toThrow();
    expect(() => assertUrl('http://IDENTITY-SERVICE:9/certs', hosts)).not.toThrow();
  });

  test.each([
    'http://identity-service.evil.example/certs',
    'http://evil-identity-service/certs',
    'http://identity-service@evil.example/certs',
    'http://evil.example#@identity-service/certs',
    'http://evil.example/@identity-service',
    'http://identity-service./certs',
    'http://other-service/certs',
  ])('%s is not covered by the entry identity-service', (url) => {
    expect(refusal(() => assertUrl(url, ['identity-service']))).toContain('is not allowed');
  });

  test('an https URL needs no entry, and an entry never widens another scheme', () => {
    expect(() => assertUrl('https://anything.example/certs', ['identity-service'])).not.toThrow();
    expect(
      refusal(() => assertUrl('ftp://identity-service/certs', ['identity-service'])),
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
});

describe('JWKSUrlPolicy.resolveHttpHosts', () => {
  test('an unset list is an empty one', () => {
    expect(JWKSUrlPolicy.resolveHttpHosts({ scope: SCOPE }).size).toBe(0);
  });

  test('host names are kept, trimmed and lower-cased', () => {
    const resolved = JWKSUrlPolicy.resolveHttpHosts({
      scope: SCOPE,
      hosts: [' Identity-Service ', 'auth.internal', 'a'],
    });

    expect([...resolved]).toEqual(['identity-service', 'auth.internal', 'a']);
  });

  test.each([
    ['a port', 'identity-service:3000'],
    ['a scheme', 'http://identity-service'],
    ['a path', 'identity-service/certs'],
    ['a wildcard', '*.internal'],
    ['a range', '10.0.0.0/8'],
    ['an IPv4 address', '10.0.0.5'],
    ['an IPv6 address', '[::1]'],
    ['an empty string', ''],
    ['a blank string', '   '],
    ['credentials', 'user@identity-service'],
    ['a leading hyphen', '-identity'],
    ['a number', 5],
    ['null', null],
  ])('an entry with %s is refused, naming the entry', (_name, entry) => {
    const message = refusal(() => JWKSUrlPolicy.resolveHttpHosts({ scope: SCOPE, hosts: [entry] }));

    expect(message).toContain('jwks.hosts.http');
    expect(message).toContain(JSON.stringify(entry));
  });

  test('a list that is not a list is refused', () => {
    expect(
      refusal(() => JWKSUrlPolicy.resolveHttpHosts({ scope: SCOPE, hosts: 'identity' })),
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

  test('an http URL to a host that is not allowed refuses to boot', async () => {
    const message = await boot({
      jwtOptions: verifier({ jwksUrl: 'http://identity-service:3000/certs' }),
    });

    expect(message).toContain('uses http:');
    expect(message).toContain('jwks.hosts.http');
  });

  test('an http URL to a host named in jwks.hosts.http boots', async () => {
    const jwtOptions = verifier({
      jwksUrl: 'http://identity-service:3000/certs',
      jwks: { hosts: { http: ['identity-service'] } },
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

  test('a list entry with a port refuses to boot', async () => {
    const jwtOptions = verifier({
      jwksUrl: 'http://identity-service:3000/certs',
      jwks: { hosts: { http: ['identity-service:3000'] } },
    });

    const result4 = await boot({ jwtOptions });
    expect(result4).toContain('jwks.hosts.http');
  });
});

describe('the service-assertion callers', () => {
  test('https callers boot', async () => {
    const result = await boot({ serviceOptions: service() });
    expect(result).toBeNull();
  });

  test('an http caller to a host that is not allowed refuses to boot, naming the caller', async () => {
    const message = await boot({
      serviceOptions: service({ callers: { commerce: 'http://commerce:3000/svc-certs' } }),
    });

    expect(message).toContain('callers["commerce"].jwksUrl');
    expect(message).toContain('jwks.hosts.http');
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

  test('callers on hosts named in jwks.hosts.http boot, on any port', async () => {
    const serviceOptions = service({
      callers: {
        commerce: 'http://commerce:3000/svc-certs',
        billing: 'http://billing:8080/svc-certs',
        local: 'http://localhost:3001/svc-certs',
      },
      jwks: { hosts: { http: ['commerce', 'billing'] } },
    });

    const result2 = await boot({ serviceOptions });
    expect(result2).toBeNull();
  });

  test('a list entry that is not a host name refuses to boot even with no http caller', async () => {
    const serviceOptions = service({ jwks: { hosts: { http: ['*.internal'] } } });

    const result3 = await boot({ serviceOptions });
    expect(result3).toContain('jwks.hosts.http');
  });
});
