import { describe, expect, test } from 'bun:test';
import { REDACTED, redactSecrets } from '@/common/redact';
import { formatLogMessage } from '@/modules/logger';

/**
 * Both fetchers log the request config (headers, which may carry a bearer token/api key/cookie) at
 * INFO on every call. Tests assert on the rendered LOG LINE, not the redactor's return value - re-redacting the fixture would prove nothing about the call site.
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

  test('even a config passed RAW to the logger is redacted - redaction is systemic now', () => {
    // The call site still pre-redacts, but redaction also lives in formatLogMessage itself: a raw
    // config handed straight to the deep-inspect path never renders its bearer token or api key.
    const line = formatLogMessage({
      message: 'Props: %s',
      args: [buildRequestConfig()],
    });

    expect(line).not.toContain('SUPER_SECRET_TOKEN');
    expect(line).not.toContain('ak_live_51H9');
    expect(line).toContain(REDACTED);
  });
});
