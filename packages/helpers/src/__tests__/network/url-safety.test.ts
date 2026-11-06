/**
 * The address list comes from a consumer's draft guard, contributed at
 * `agent-contracts/ignis/2026-09-08-ssrf-fetch-guard-input.md`, and is the floor this must meet.
 */

import { describe, expect, test } from 'bun:test';
import { UrlPolicy, UrlSchemes } from '@/modules/network/utilities/url-safety/policy';

const NON_PUBLIC = [
  '169.254.169.254',
  '127.0.0.1',
  '0.0.0.0',
  '10.1.2.3',
  '172.16.0.1',
  '172.31.255.255',
  '192.168.1.1',
  '100.64.0.1',
  '198.18.0.1',
  '224.0.0.1',
  '::1',
  '::',
  'fd00::1',
  'fe80::1',
  '::ffff:169.254.169.254',
  'not-an-address',
];

const PUBLIC = [
  '8.8.8.8',
  '1.1.1.1',
  '172.32.0.1',
  '192.169.0.1',
  '203.0.113.10',
  '2001:4860:4860::8888',
];

const captureMessage = (task: () => unknown): string => {
  try {
    task();

    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('UrlPolicy.isNonPublicAddress', () => {
  test.each(NON_PUBLIC)('rejects %s', (address) => {
    expect(UrlPolicy.isNonPublicAddress({ address })).toBe(true);
  });

  test.each(PUBLIC)('accepts %s', (address) => {
    expect(UrlPolicy.isNonPublicAddress({ address })).toBe(false);
  });
});

describe('UrlPolicy.assertSafeUrl', () => {
  test('accepts an https url on a public host', () => {
    expect(() => UrlPolicy.assertSafeUrl({ url: 'https://cdn.example.com/a.png' })).not.toThrow();
  });

  test('refuses a scheme outside the allow-list', () => {
    const message = captureMessage(() => UrlPolicy.assertSafeUrl({ url: 'file:///etc/passwd' }));
    expect(message).toContain('scheme');
  });

  test('refuses plain http by default', () => {
    const message = captureMessage(() =>
      UrlPolicy.assertSafeUrl({ url: 'http://cdn.example.com/a.png' }),
    );
    expect(message).toContain('scheme');
  });

  test('accepts plain http when the CALLER allows it', () => {
    expect(() =>
      UrlPolicy.assertSafeUrl({
        url: 'http://cdn.example.com/a.png',
        policy: { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS] },
      }),
    ).not.toThrow();
  });

  test('refuses a literal non-public address without resolving anything', () => {
    const message = captureMessage(() =>
      UrlPolicy.assertSafeUrl({ url: 'https://169.254.169.254/latest' }),
    );
    expect(message).toContain('non-public');
  });

  test('refuses a bracketed IPv6 loopback literal', () => {
    const message = captureMessage(() => UrlPolicy.assertSafeUrl({ url: 'https://[::1]/latest' }));
    expect(message).toContain('non-public');
  });

  test('refuses a malformed url', () => {
    const message = captureMessage(() => UrlPolicy.assertSafeUrl({ url: 'not a url at all' }));
    expect(message).toContain('Malformed');
  });

  test('allowPrivateAddress lets a literal private address through', () => {
    expect(() =>
      UrlPolicy.assertSafeUrl({
        url: 'https://127.0.0.1/health',
        policy: { allowPrivateAddress: true },
      }),
    ).not.toThrow();
  });

  test('an allowedHosts list refuses every host outside it', () => {
    const policy = { allowedHosts: ['cdn.example.com'] };

    expect(() =>
      UrlPolicy.assertSafeUrl({ url: 'https://cdn.example.com/a.png', policy }),
    ).not.toThrow();
    expect(
      captureMessage(() => UrlPolicy.assertSafeUrl({ url: 'https://evil.test/a.png', policy })),
    ).toContain('host');
  });

  test('a hostname is left for UrlIngest - this half never resolves', () => {
    // `assertSafeUrl` is the browser-pure half: it cannot do DNS, so a hostname that resolves to
    // loopback passes HERE and is caught by `UrlIngest.assertPublicHost`.
    expect(() =>
      UrlPolicy.assertSafeUrl({ url: 'https://localhost.example.com/a.png' }),
    ).not.toThrow();
  });
});

/**
 * The gap a consumer found: every case above feeds the predicate a string the WHATWG parser never
 * produces. `new URL` rewrites a v4-mapped literal into hex, so a dotted-quad-only check was green
 * over a live bypass. These drive real urls.
 */
describe('UrlPolicy.assertSafeUrl - addresses the URL parser rewrites', () => {
  const httpPolicy = { allowedSchemes: [UrlSchemes.HTTP, UrlSchemes.HTTPS] };

  test.each([
    ['v4-mapped metadata, hex after parsing', 'http://[::ffff:169.254.169.254]/latest/meta-data/'],
    ['v4-mapped loopback', 'http://[::ffff:127.0.0.1]/'],
    ['v4-mapped private', 'http://[::ffff:10.0.0.1]/'],
    ['bracketed loopback', 'http://[::1]/'],
    ['decimal integer form', 'http://2852039166/'],
    ['octal form', 'http://0177.0.0.1/'],
    ['hex form', 'http://0x7f.0.0.1/'],
    ['short form', 'http://127.1/'],
  ])('refuses %s', (_label, url) => {
    expect(captureMessage(() => UrlPolicy.assertSafeUrl({ url, policy: httpPolicy }))).toContain(
      'non-public',
    );
  });

  test('a v4-mapped PUBLIC address still passes', () => {
    expect(() =>
      UrlPolicy.assertSafeUrl({ url: 'http://[::ffff:8.8.8.8]/', policy: httpPolicy }),
    ).not.toThrow();
  });

  test('what the parser hands the predicate is the hex form, not the dotted one', () => {
    // Pins the reason the earlier suite was green over a hole.
    expect(new URL('http://[::ffff:169.254.169.254]/').hostname).toBe('[::ffff:a9fe:a9fe]');
    expect(UrlPolicy.isNonPublicAddress({ address: '::ffff:a9fe:a9fe' })).toBe(true);
  });
});

/** The IPv6 ranges the prefix test missed (#939), each with the spelling a direct caller may use. */
const NON_PUBLIC_IPV6 = [
  '64:ff9b::a9fe:a9fe', // NAT64 of 169.254.169.254
  '64:ff9b::169.254.169.254',
  '64:ff9b::7f00:1', // NAT64 of 127.0.0.1
  '64:ff9b::a00:1', // NAT64 of 10.0.0.1
  '0064:ff9b:0000:0000:0000:0000:a9fe:a9fe',
  '64:ff9b:1::1', // local-use NAT64
  'ff02::1', // multicast
  'ff00::',
  'FF02::1',
  '2001:db8::1', // documentation
  '2001:0db8:0:0:0:0:0:1',
  '2001::1', // Teredo
  '2002:a9fe:a9fe::1', // 6to4 of 169.254.169.254
  '2002:7f00:1::', // 6to4 of 127.0.0.1
  '::127.0.0.1', // IPv4-compatible
  '::7f00:1',
  '::10.0.0.1',
  '::169.254.169.254',
  '0:0:0:0:0:0:0:1', // loopback, spelled out
  '0000:0000:0000:0000:0000:0000:0000:0001',
  '0:0:0:0:0:0:0:0',
  '::0001',
  '0:0:0:0:0:ffff:a9fe:a9fe', // v4-mapped, spelled out
  '0:0:0:0:0:ffff:169.254.169.254',
  'FE80::1', // link-local, upper case
  'febf::1',
  'fc00::1',
  'FD00::1',
  '::2', // reserved ::/8
  'fe80::1%eth0', // a zone id is dropped, the address still counts
];

const MALFORMED_IPV6 = [
  '1::2::3',
  ':1',
  '1:',
  ':::',
  '1:2:3:4:5:6:7:8:9',
  '1:2:3:4:5:6:7',
  '12345::1',
  'g::1',
  '::1.2.3',
  '::256.0.0.1',
  '1.2.3.4:5',
];

const PUBLIC_IPV6 = [
  '2001:4860:4860::8888',
  '2606:4700:4700::1111',
  '2a00:1450:4001::200e',
  '64:ff9b::808:808', // NAT64 of 8.8.8.8
  '64:ff9b::8.8.8.8',
  '2002:808:808::1', // 6to4 of 8.8.8.8
  '::ffff:8.8.8.8',
  '::8.8.8.8', // IPv4-compatible of a public address
  '2001:1::1', // not Teredo, not documentation
  '2003::1',
];

describe('UrlPolicy.isNonPublicAddress - IPv6 ranges and spellings (#939)', () => {
  test.each(NON_PUBLIC_IPV6)('rejects %s', (address) => {
    expect(UrlPolicy.isNonPublicAddress({ address })).toBe(true);
  });

  test.each(MALFORMED_IPV6)('a string that is not an IPv6 literal fails closed: %s', (address) => {
    expect(UrlPolicy.isNonPublicAddress({ address })).toBe(true);
  });

  test.each(PUBLIC_IPV6)('accepts %s', (address) => {
    expect(UrlPolicy.isNonPublicAddress({ address })).toBe(false);
  });

  test('every spelling of one address gets one answer', () => {
    const spellings = [
      '::1',
      '0:0:0:0:0:0:0:1',
      '0000:0000:0000:0000:0000:0000:0000:0001',
      '::0:1',
    ];

    expect(spellings.map((address) => UrlPolicy.isNonPublicAddress({ address }))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  test('a domain name is not an IP literal and answers true', () => {
    expect(UrlPolicy.isNonPublicAddress({ address: 'example.com' })).toBe(true);
  });
});

describe('UrlPolicy.assertSafeUrl - IPv6 literals through NAT64 and 6to4 (#939)', () => {
  test.each([
    'https://[64:ff9b::a9fe:a9fe]/',
    'https://[64:ff9b::169.254.169.254]/latest/meta-data',
    'https://[2002:a9fe:a9fe::1]/',
    'https://[ff02::1]/',
    'https://[2001:db8::1]/',
    'https://[::127.0.0.1]/',
    'https://[0:0:0:0:0:0:0:1]/',
  ])('refuses %s', (url) => {
    expect(captureMessage(() => UrlPolicy.assertSafeUrl({ url }))).toContain('non-public address');
  });

  test('a NAT64 or 6to4 address of a PUBLIC host passes', () => {
    expect(() => UrlPolicy.assertSafeUrl({ url: 'https://[64:ff9b::808:808]/' })).not.toThrow();
    expect(() => UrlPolicy.assertSafeUrl({ url: 'https://[2002:808:808::1]/' })).not.toThrow();
  });
});

describe('UrlPolicy.assertSafeUrl - userinfo (#939)', () => {
  const refuse = (
    url: string,
    policy?: Parameters<typeof UrlPolicy.assertSafeUrl>[0]['policy'],
  ) => {
    let thrown: unknown;

    try {
      UrlPolicy.assertSafeUrl({ url, policy });
    } catch (error) {
      thrown = error;
    }

    return thrown;
  };

  test.each([
    'https://user:pass@example.com/x',
    'https://user@example.com/x',
    'https://:pass@example.com/x',
    'https://evil.com@example.com/x',
    'https://example.com:443@evil.com/x',
  ])('refuses %s with URL_REFUSED', (url) => {
    const error = refuse(url);

    expect(error).toBeInstanceOf(Error);
    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
    expect((error as Error).message).toContain('username or a password');
  });

  test('no policy flag lets userinfo through', () => {
    const error = refuse('https://user:pass@example.com/x', {
      allowPrivateAddress: true,
      allowedHosts: ['example.com'],
    });

    expect(UrlPolicy.isRefusedError({ error })).toBe(true);
  });

  test('a url without userinfo, with an @ in the path or query, still passes', () => {
    expect(() => UrlPolicy.assertSafeUrl({ url: 'https://example.com/a@b?x=y@z' })).not.toThrow();
  });
});
