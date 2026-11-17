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

  test('host names are kept and lower-cased', () => {
    const resolved = JWKSUrlPolicy.resolveHttpHosts({
      scope: SCOPE,
      hosts: ['Identity-Service', 'auth.internal', 'a'],
    });

    expect([...resolved]).toEqual(['identity-service', 'auth.internal', 'a']);
  });

  test.each([
    ['a scheme', 'http://identity-service'],
    ['a scheme and a port', 'http://identity-service:3000'],
    ['a path', 'identity-service/certs'],
    ['a path after a port', 'identity-service:3000/certs'],
    ['a query', 'identity-service?x=1'],
    ['a fragment', 'identity-service#x'],
    ['a wildcard', '*.internal'],
    ['a wildcard port', 'identity-service:*'],
    ['a range', '10.0.0.0/8'],
    ['a port range', 'identity-service:3000-3010'],
    ['a decimal address', '2130706433'],
    ['a decimal address with a port', '2130706433:3000'],
    ['a hexadecimal address', '0x7f000001'],
    ['a hexadecimal dotted address', '0x7f.1'],
    ['an octal address', '010.0.0.5'],
    ['a zero-padded address', '10.0.0.05'],
    ['a short dotted address', '1.2.3'],
    ['a five-part address', '1.2.3.4.5'],
    ['an address out of range', '256.0.0.1'],
    ['an IPv4-mapped IPv6 address in the dotted form', '[::ffff:10.0.0.5]'],
    ['an IPv6 address with a zone', '[fe80::1%eth0]'],
    ['an IPv6 address that is not in the parser form', '[FD00:0:0:0:0:0:0:1]'],
    ['an IPv6 address without brackets', 'fd00::1'],
    ['an IPv6 address with one bracket', '[fd00::1'],
    ['an IPv6 address with a closing bracket and a port without a colon', '[fd00::1]8443'],
    ['an empty port', 'identity-service:'],
    ['a port above 65535', 'identity-service:65536'],
    ['a port of zero', 'identity-service:0'],
    ['a port with a leading zero', 'identity-service:03000'],
    ['a port with a sign', 'identity-service:+3000'],
    ['a port in hexadecimal', 'identity-service:0xbb8'],
    ['two ports', 'identity-service:3000:4000'],
    ['an empty label', 'a..b'],
    ['a trailing dot', 'identity-service.'],
    ['a leading dot', '.identity-service'],
    ['an empty string', ''],
    ['a blank string', '   '],
    ['a leading space', ' identity-service'],
    ['a trailing space', 'identity-service '],
    ['a trailing tab', '10.0.0.5:8080\t'],
    ['a trailing newline', '10.0.0.5:8080\n'],
    ['a leading newline', '\nidentity-service'],
    ['a carriage return', 'identity-service\r'],
    ['a space inside', 'identity service'],
    ['a label of 64 characters', `${'a'.repeat(64)}.internal`],
    [
      'a name of 254 characters',
      `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,
    ],
    ['the unspecified IPv4 address', '0.0.0.0'],
    ['the unspecified IPv4 address with a port', '0.0.0.0:8080'],
    ['the unspecified IPv6 address', '[::]'],
    ['the unspecified IPv6 address with a port', '[::]:8080'],
    ['the unspecified IPv6 address in the long form', '[0:0:0:0:0:0:0:0]'],
    ['zero as an address', '0'],
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

describe('JWKSUrlPolicy.resolveHttpHosts: exact addresses and ports', () => {
  const resolve = (...hosts: Array<unknown>) => [
    ...JWKSUrlPolicy.resolveHttpHosts({ scope: SCOPE, hosts }),
  ];

  test('a name, an IPv4 address and a bracketed IPv6 address are kept, each with or without a port', () => {
    expect(
      resolve(
        'identity-service',
        'identity-service:3000',
        '10.0.0.5',
        '10.0.0.5:8080',
        '[fd00::1]',
        '[fd00::1]:8443',
      ),
    ).toEqual([
      'identity-service',
      'identity-service:3000',
      '10.0.0.5',
      '10.0.0.5:8080',
      '[fd00::1]',
      '[fd00::1]:8443',
    ]);
  });

  test('entries are lower-cased, and the port is kept as written', () => {
    expect(resolve('Identity-Service:3000', '[FD00::1]:8443')).toEqual([
      'identity-service:3000',
      '[fd00::1]:8443',
    ]);
  });

  test('the default port is a port: ":80" is kept, so it covers a URL with no port', () => {
    expect(resolve('identity-service:80')).toEqual(['identity-service:80']);
  });

  test('the same host listed twice is one entry', () => {
    expect(resolve('10.0.0.5', '10.0.0.5')).toEqual(['10.0.0.5']);
  });

  test('an IPv6 address the parser writes in the long form is refused, the short one is kept', () => {
    expect(() => resolve('[fd00:0:0:0:0:0:0:1]')).toThrow(/jwks.hosts.http holds/);
    expect(resolve('[fd00::1]')).toEqual(['[fd00::1]']);
  });
});

describe('JWKSUrlPolicy.resolveHttpHosts: limits', () => {
  const resolve = (...hosts: Array<unknown>) => [
    ...JWKSUrlPolicy.resolveHttpHosts({ scope: SCOPE, hosts }),
  ];

  test('a label of 63 characters and a name of 253 are kept', () => {
    const label = 'a'.repeat(63);
    const name = `${label}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;

    expect(name).toHaveLength(253);
    expect(resolve(label, name)).toEqual([label, name]);
  });

  test('the limits are for names: an address is judged by the parser alone', () => {
    expect(resolve('255.255.255.255', '[ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]')).toHaveLength(2);
  });

  test('the refusal of a too long name names the entry', () => {
    const entry = `${'a'.repeat(64)}.internal`;

    expect(refusal(() => resolve(entry))).toContain('jwks.hosts.http holds');
  });
});

describe('JWKSUrlPolicy.assertUrl: port 0', () => {
  test.each([
    'http://10.0.0.5:0/certs',
    'http://identity-service:0/certs',
    'http://127.0.0.1:0/certs',
    'http://[fd00::1]:0/certs',
  ])('%s is refused, whatever the entries', (url) => {
    const message = refusal(() => assertUrl(url, ['10.0.0.5', 'identity-service', '[fd00::1]']));

    expect(message).toContain('uses port 0');
  });

  test('the refusal names the host, never the URL', () => {
    const message = refusal(() => assertUrl('http://admin:hunter2@10.0.0.5:0/certs', ['10.0.0.5']));

    expect(message).toContain("'10.0.0.5'");
    expect(message).not.toContain('hunter2');
  });

  test('a port that is merely written with a zero is the port it is', () => {
    expect(() => assertUrl('http://10.0.0.5:08080/certs', ['10.0.0.5:8080'])).not.toThrow();
    expect(() => assertUrl('http://10.0.0.5:00080/certs', ['10.0.0.5:80'])).not.toThrow();
  });
});

describe('JWKSUrlPolicy.assertUrl: an entry that is an address or has a port', () => {
  test('a listed IPv4 address is accepted over http, on any port, and only that address', () => {
    const hosts = ['10.0.0.5'];

    expect(() => assertUrl('http://10.0.0.5/certs', hosts)).not.toThrow();
    expect(() => assertUrl('http://10.0.0.5:3000/certs', hosts)).not.toThrow();
    expect(() => assertUrl('http://10.0.0.5:65535/certs', hosts)).not.toThrow();
  });

  test.each([
    'http://10.0.0.50/certs',
    'http://10.0.0.6/certs',
    'http://10.0.0.4:3000/certs',
    'http://110.0.0.5/certs',
    'http://10.0.0.5.evil.example/certs',
    'http://10.0.0.5evil.example/certs',
    'http://evil.example/10.0.0.5',
    'http://10.0.0.5@evil.example/certs',
    'http://evil.example#@10.0.0.5/certs',
    'http://10.0.0.5:3000@evil.example/certs',
  ])('%s is not covered by the entry 10.0.0.5', (url) => {
    expect(refusal(() => assertUrl(url, ['10.0.0.5']))).toContain('is not allowed');
  });

  test.each([
    ['167772165', '10.0.0.5 as one number'],
    ['0xa000005', '10.0.0.5 in hexadecimal'],
    ['012.0.0.5', '10.0.0.5 with an octal first part'],
    ['10.5', '10.0.0.5 in short form'],
    ['10.0.0.5.', '10.0.0.5 with a trailing dot, which the parser drops from an address'],
  ])(
    'http://%s is read by the parser as %s, so the entry 10.0.0.5 covers it and no other does',
    (host) => {
      expect(() => assertUrl(`http://${host}/certs`, ['10.0.0.5'])).not.toThrow();
      expect(refusal(() => assertUrl(`http://${host}/certs`, ['10.0.0.6']))).toContain(
        'is not allowed',
      );
    },
  );

  test.each([
    'http://[::ffff:10.0.0.5]/certs',
    'http://[::ffff:a00:5]/certs',
    'http://[0:0:0:0:0:ffff:a00:5]/certs',
  ])('the IPv4-mapped IPv6 form %s does not sneak past the entry 10.0.0.5', (url) => {
    expect(refusal(() => assertUrl(url, ['10.0.0.5']))).toContain('is not allowed');
  });

  test('an entry with a port covers that port only', () => {
    const hosts = ['identity-service:3000', '10.0.0.5:8080'];

    expect(() => assertUrl('http://identity-service:3000/certs', hosts)).not.toThrow();
    expect(() => assertUrl('http://10.0.0.5:8080/certs', hosts)).not.toThrow();

    for (const url of [
      'http://identity-service/certs',
      'http://identity-service:30000/certs',
      'http://identity-service:300/certs',
      'http://identity-service:3001/certs',
      'http://10.0.0.5/certs',
      'http://10.0.0.5:80/certs',
      'http://10.0.0.5:8081/certs',
      'http://10.0.0.6:8080/certs',
    ]) {
      expect(refusal(() => assertUrl(url, hosts))).toContain('is not allowed');
    }
  });

  test('an entry without a port covers every port, an entry with one does not widen to the host', () => {
    expect(() => assertUrl('http://identity-service:9/certs', ['identity-service'])).not.toThrow();
    expect(
      refusal(() => assertUrl('http://identity-service:9/certs', ['identity-service:3000'])),
    ).toContain('is not allowed');
  });

  test('an entry with the default port covers a URL that names no port, and one that names it', () => {
    const hosts = ['identity-service:80', '10.0.0.5:80'];

    expect(() => assertUrl('http://identity-service/certs', hosts)).not.toThrow();
    expect(() => assertUrl('http://identity-service:80/certs', hosts)).not.toThrow();
    expect(() => assertUrl('http://10.0.0.5/certs', hosts)).not.toThrow();
    expect(refusal(() => assertUrl('http://identity-service:8080/certs', hosts))).toContain(
      'is not allowed',
    );
  });

  test('a listed IPv6 address is accepted in brackets, with or without a port, and only that address', () => {
    expect(() => assertUrl('http://[fd00::1]/certs', ['[fd00::1]'])).not.toThrow();
    expect(() => assertUrl('http://[fd00::1]:9000/certs', ['[fd00::1]'])).not.toThrow();
    expect(() => assertUrl('http://[fd00::1]:8443/certs', ['[fd00::1]:8443'])).not.toThrow();
    // The parser writes the long form as the short one, so it is the same address.
    expect(() =>
      assertUrl('http://[FD00:0:0:0:0:0:0:1]:8443/certs', ['[fd00::1]:8443']),
    ).not.toThrow();

    for (const url of [
      'http://[fd00::1]:9000/certs',
      'http://[fd00::2]:8443/certs',
      'http://[fd00::10]:8443/certs',
      'http://[fd00::1:0]:8443/certs',
    ]) {
      expect(refusal(() => assertUrl(url, ['[fd00::1]:8443']))).toContain('is not allowed');
    }
  });

  test('the mapped form of an address is the same machine, but it is another entry', () => {
    // `[::ffff:a00:5]` reaches 10.0.0.5: listing it is listing that machine. Listing 10.0.0.5 does not list it.
    expect(() => assertUrl('http://[::ffff:10.0.0.5]/certs', ['[::ffff:a00:5]'])).not.toThrow();
    expect(refusal(() => assertUrl('http://10.0.0.5/certs', ['[::ffff:a00:5]']))).toContain(
      'is not allowed',
    );
  });

  test('an address entry never widens to a name, and a name entry never widens to an address', () => {
    expect(refusal(() => assertUrl('http://identity-service/certs', ['10.0.0.5']))).toContain(
      'is not allowed',
    );
    expect(refusal(() => assertUrl('http://10.0.0.5/certs', ['identity-service']))).toContain(
      'is not allowed',
    );
  });

  test('loopback stays allowed with no entry, and an entry never turns off a refusal for another host', () => {
    expect(() => assertUrl('http://127.0.0.1:3000/certs', ['10.0.0.5'])).not.toThrow();
    expect(() => assertUrl('http://[::1]:3000/certs', ['10.0.0.5:8080'])).not.toThrow();
    expect(refusal(() => assertUrl('http://10.0.0.6:8080/certs', ['10.0.0.5:8080']))).toContain(
      'is not allowed',
    );
  });

  test('an https URL needs no entry, and an entry with a port never widens another scheme', () => {
    expect(() => assertUrl('https://10.0.0.9:1/certs', ['10.0.0.5:8080'])).not.toThrow();
    expect(refusal(() => assertUrl('ftp://10.0.0.5:8080/certs', ['10.0.0.5:8080']))).toContain(
      'must use https',
    );
  });

  test('a refusal names the host the parser reads, never the entry list', () => {
    const message = refusal(() => assertUrl('http://167772166:3000/certs', ['10.0.0.5']));

    expect(message).toContain("the host '10.0.0.6' is not allowed");
    expect(message).not.toContain('10.0.0.5');
  });
});

describe('JWKSUrlPolicy.assertUrl: forms of the same host', () => {
  test.each(['HTTP://localhost/certs', 'Http://LOCALHOST:3000/certs'])(
    'an upper-case scheme or host is read as the parser reads it: %s is loopback',
    (url) => {
      expect(() => assertUrl(url)).not.toThrow();
    },
  );

  test('an upper-case scheme and host are held to the list like any other', () => {
    expect(refusal(() => assertUrl('HTTP://Identity-Service/certs'))).toContain('is not allowed');
    expect(() => assertUrl('HTTP://Identity-Service/certs', ['identity-service'])).not.toThrow();
  });

  test.each([
    ['2130706433', '127.0.0.1 as one number'],
    ['0x7f.1', '127.0.0.1 in hexadecimal and short form'],
    ['0177.0.0.1', '127.0.0.1 in octal'],
  ])('http://%s is loopback, as the parser writes %s', (host) => {
    expect(() => assertUrl(`http://${host}/certs`)).not.toThrow();
  });

  test.each([
    ['167772161', '10.0.0.1 as one number'],
    ['0xa000001', '10.0.0.1 in hexadecimal'],
    ['3232235777', '192.168.1.1 as one number'],
  ])('http://%s is not loopback, and as an entry it is refused: %s', (host) => {
    expect(refusal(() => assertUrl(`http://${host}/certs`))).toContain('is not allowed');
    expect(refusal(() => assertUrl(`http://${host}/certs`, [host]))).toContain(
      'jwks.hosts.http holds',
    );
  });

  test.each(['[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::2]', '[fe80::1]'])(
    'the IPv6 form %s is not loopback (only ::1 is), so it is refused',
    (host) => {
      expect(refusal(() => assertUrl(`http://${host}:3000/certs`))).toContain('is not allowed');
    },
  );
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

  test('a list entry with a port boots a URL on that port', async () => {
    const jwtOptions = verifier({
      jwksUrl: 'http://identity-service:3000/certs',
      jwks: { hosts: { http: ['identity-service:3000'] } },
    });

    const result4 = await boot({ jwtOptions });
    expect(result4).toBeNull();
  });

  test('an IP:port entry boots, and the same IP on another port refuses to boot', async () => {
    const hosts = { http: ['10.0.0.5:8080'] };

    const listedPort = await boot({
      jwtOptions: verifier({ jwksUrl: 'http://10.0.0.5:8080/certs', jwks: { hosts } }),
    });
    const otherPort = await boot({
      jwtOptions: verifier({ jwksUrl: 'http://10.0.0.5:9090/certs', jwks: { hosts } }),
    });

    expect(listedPort).toBeNull();
    expect(otherPort).toContain('is not allowed');
  });

  test('an entry that is not an exact host refuses to boot', async () => {
    const jwtOptions = verifier({
      jwksUrl: 'http://10.0.0.5:3000/certs',
      jwks: { hosts: { http: ['10.0.0.0/8'] } },
    });

    const result5 = await boot({ jwtOptions });
    expect(result5).toContain('jwks.hosts.http');
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

    expect(String(caught?.cause)).toContain("the host 'identity-service' is not allowed");
  });

  test('the service-assertion verifier refuses a caller URL the policy refuses, before any fetch', async () => {
    const jose = await JoseLoader.load();
    const assertionVerifier = new ServiceAssertionVerifierService({
      name: 'inventory',
      callers: { commerce: 'http://commerce:3000/svc-certs' },
      resolvePrincipal: () => ({ userId: 'svc' }),
    } as never);

    const message = refusal(() => assertionVerifier['resolveKeySet']({ issuer: 'commerce', jose }));

    expect(message).toContain("the host 'commerce' is not allowed");
  });

  test('the same URL passes it when the host is listed', async () => {
    const jose = await JoseLoader.load();
    const listedVerifier = new ServiceAssertionVerifierService({
      name: 'inventory',
      callers: { commerce: 'http://commerce:3000/svc-certs' },
      jwks: { hosts: { http: ['commerce'] } },
      resolvePrincipal: () => ({ userId: 'svc' }),
    } as never);

    expect(() => listedVerifier['resolveKeySet']({ issuer: 'commerce', jose })).not.toThrow();
  });
});
