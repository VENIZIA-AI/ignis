import { describe, expect, test } from 'bun:test';
import { REDACTED, RedactUtility } from '@/common/redact';
import { LogFormatUtility } from '@/modules/logger';

/** A request config an application logs (headers may carry a bearer token, an api key, a cookie) is redacted. Tests assert on the rendered LOG LINE. The fetchers' own debug line writes header names only. */
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
    const line = LogFormatUtility.formatMessage({
      message: 'URL: %s | Props: %s',
      args: [
        'https://api.example.com/v1/orders',
        RedactUtility.redactSecrets({ value: buildRequestConfig() }),
      ],
    });

    expect(line).not.toContain('SUPER_SECRET_TOKEN');
    expect(line).not.toContain('ak_live_51H9');
    expect(line).toContain(REDACTED);
  });

  test('the parts that make the line USEFUL survive', () => {
    const line = LogFormatUtility.formatMessage({
      message: 'URL: %s | Props: %s',
      args: [
        'https://api.example.com/v1/orders',
        RedactUtility.redactSecrets({ value: buildRequestConfig() }),
      ],
    });

    expect(line).toContain('https://api.example.com/v1/orders');
    expect(line).toContain('POST');
    expect(line).toContain('content-type');
  });

  test('even a config passed RAW to the logger is redacted - redaction is systemic now', () => {
    // Redaction lives in formatLogMessage itself: a raw config handed straight to the deep-inspect path never renders its bearer token or api key.
    const line = LogFormatUtility.formatMessage({
      message: 'Props: %s',
      args: [buildRequestConfig()],
    });

    expect(line).not.toContain('SUPER_SECRET_TOKEN');
    expect(line).not.toContain('ak_live_51H9');
    expect(line).toContain(REDACTED);
  });
});
