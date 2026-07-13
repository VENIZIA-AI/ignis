import { describe, expect, test } from 'bun:test';
import { REDACTED, redactSecrets, redactUrlCredentials } from '@/common/redact';

/**
 * A secret that reaches a log line has left the process: log files are shipped to an aggregator,
 * kept for months, and read by people who were never meant to hold the key. These tests pin the two
 * shapes a secret arrives in - a KEY in an options object, and the authority section of a URL.
 */
describe('redactUrlCredentials', () => {
  test('a broker URL keeps its host and user but loses the password', () => {
    const redacted = redactUrlCredentials('mqtts://ingest:hunter2@broker.internal:8883');

    expect(redacted).not.toContain('hunter2');
    expect(redacted).toContain(REDACTED);
    // The host and the user are what make the log line useful - they must survive.
    expect(redacted).toContain('broker.internal:8883');
    expect(redacted).toContain('ingest');
  });

  test('a URL with no password is returned untouched', () => {
    const url = 'mqtt://broker.internal:1883';

    expect(redactUrlCredentials(url)).toBe(url);
  });

  test('a non-URL string is returned untouched, not blanked', () => {
    // Blanking it would hide the very value the operator opened the log to see.
    expect(redactUrlCredentials('not a url at all')).toBe('not a url at all');
  });

  test('a postgres-style URL is handled the same way', () => {
    const redacted = redactUrlCredentials('postgresql://app:s3cr3t@db:5432/main');

    expect(redacted).not.toContain('s3cr3t');
    expect(redacted).toContain('db:5432');
  });
});

describe('redactSecrets - the shapes a TLS/MQTT options object actually takes', () => {
  test('a TLS private key, passphrase and cert are all redacted, host is kept', () => {
    const redacted = redactSecrets({
      host: '10.0.0.7',
      port: 8883,
      key: '-----BEGIN PRIVATE KEY-----MIIEvg...',
      passphrase: 'hunter2',
      cert: '-----BEGIN CERTIFICATE-----MIID...',
      password: 'hunter2',
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('BEGIN PRIVATE KEY');
    expect(serialized).not.toContain('hunter2');
    expect(redacted.key).toBe(REDACTED);
    expect(redacted.passphrase).toBe(REDACTED);
    expect(redacted.password).toBe(REDACTED);
    expect(redacted.host).toBe('10.0.0.7');
    expect(redacted.port).toBe(8883);
  });

  test('a Buffer under a NON-secret key is summarized, not serialized', () => {
    // The key must not be one SECRET_KEY_PATTERN already matches (`key`, `ca`, `cert`...), or the
    // value is replaced before the Buffer branch is ever reached and this test proves nothing.
    const redacted = redactSecrets({
      payload: Buffer.from('-----BEGIN CERTIFICATE-----'),
    }) as Record<string, unknown>;

    expect(redacted.payload).toBe('[Binary 27 bytes]');
    expect(JSON.stringify(redacted)).not.toContain('BEGIN CERTIFICATE');
  });

  test('a secret nested inside another object is still found', () => {
    const redacted = redactSecrets({
      connection: { tls: { privateKey: 'leak-me' } },
    });

    expect(JSON.stringify(redacted)).not.toContain('leak-me');
  });
});
