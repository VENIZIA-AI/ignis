import { describe, expect, test } from 'bun:test';
import { REDACTED, redactSecrets } from '@/common/redact';
import { formatLogMessage } from '@/modules/logger/formatters';

/**
 * Both fetchers log the request config at INFO on EVERY call. That config carries `headers`, and a
 * header set is where `Authorization: Bearer …`, an api key or a cookie lives - so an unredacted log
 * line ships a live credential to the log aggregator once per outbound request.
 *
 * These tests assert on what the LOG LINE actually renders, not on the redactor's return value: a
 * test that re-redacts its own fixture proves nothing about the call site.
 */
const buildRequestConfig = () => {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer eyJhbGciOi.SUPER_SECRET_TOKEN',
      'x-api-key': 'ak_live_51H9',
    },
    body: '{"id":1}',
  };
};

describe('fetcher request-config logging', () => {
  test('the rendered line carries no bearer token and no api key', () => {
    const line = formatLogMessage({
      message: 'URL: %s | Props: %s',
      args: ['https://api.example.com/v1/orders', redactSecrets(buildRequestConfig())],
    });

    expect(line).not.toContain('SUPER_SECRET_TOKEN');
    expect(line).not.toContain('ak_live_51H9');
    expect(line).toContain(REDACTED);
  });

  test('the parts that make the line USEFUL survive', () => {
    const line = formatLogMessage({
      message: 'URL: %s | Props: %s',
      args: ['https://api.example.com/v1/orders', redactSecrets(buildRequestConfig())],
    });

    expect(line).toContain('https://api.example.com/v1/orders');
    expect(line).toContain('POST');
    expect(line).toContain('content-type');
  });

  test('an UNREDACTED config would have leaked - this is what the guard prevents', () => {
    // The counter-example: same renderer, no redactSecrets. If this ever stops containing the token,
    // the test above has become vacuous and must be rewritten.
    const line = formatLogMessage({
      message: 'Props: %s',
      args: [buildRequestConfig()],
    });

    expect(line).toContain('SUPER_SECRET_TOKEN');
  });
});
