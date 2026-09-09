/**
 * The address list comes from BANA's draft guard, contributed at
 * `agent-contracts/ignis/2026-09-08-ssrf-fetch-guard-input.md`, and is the floor this must meet.
 */

import { describe, expect, test } from 'bun:test';
import { UrlPolicy, UrlSchemes } from '@/modules/network/url-safety/policy';

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
  test.each(NON_PUBLIC)('rejects %s', address => {
    expect(UrlPolicy.isNonPublicAddress({ address })).toBe(true);
  });

  test.each(PUBLIC)('accepts %s', address => {
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
 * The gap BANA found: every case above feeds the predicate a string the WHATWG parser never
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
