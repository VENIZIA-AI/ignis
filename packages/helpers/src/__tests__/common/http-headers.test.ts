import { HTTP } from '@/common';
import { describe, expect, test } from 'bun:test';

describe('HTTP.Headers client context', () => {
  test('names the credential provider, the locale and the time zone headers', () => {
    expect(HTTP.Headers.AUTH_PROVIDER).toBe('x-auth-provider');
    expect(HTTP.Headers.LOCALE).toBe('x-locale');
    expect(HTTP.Headers.TIMEZONE).toBe('timezone');
    expect(HTTP.Headers.TIMEZONE_OFFSET).toBe('timezone-offset');
  });

  test('no two names share a header', () => {
    const values = Object.values(HTTP.Headers);

    expect(new Set(values).size).toBe(values.length);
  });
});
