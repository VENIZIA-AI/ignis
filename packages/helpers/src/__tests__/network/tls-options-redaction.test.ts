import { describe, expect, test } from 'bun:test';
import { REDACTED, RedactUtility } from '@/common/redact';
import { NetworkTlsTcpClient } from '@/modules/network';

const TLS_OPTIONS = {
  host: '127.0.0.1',
  port: 8443,
  key: '-----BEGIN PRIVATE KEY-----REALLY-SECRET-----END PRIVATE KEY-----',
  cert: '-----BEGIN CERTIFICATE-----CERTDATA-----END CERTIFICATE-----',
  passphrase: 'my-passphrase',
  rejectUnauthorized: false,
};

describe('redactSecrets', () => {
  test('replaces secret-named keys at any depth and leaves the rest intact', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        host: 'db.internal',
        port: 5432,
        auth: { user: 'app', password: 'hunter2' },
        nested: [{ apiKey: 'abc123', label: 'keep' }],
      },
    });

    expect(redacted).toMatchObject({
      host: 'db.internal',
      port: 5432,
      auth: REDACTED,
      nested: [{ apiKey: REDACTED, label: 'keep' }],
    });
  });

  test('a Buffer-valued secret is summarized, never serialized', () => {
    const redacted = RedactUtility.redactSecrets({
      value: { key: Buffer.from('private-key-bytes') },
    });

    expect(redacted).toMatchObject({ key: REDACTED });
  });

  test('a circular structure does not hang', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;

    expect(RedactUtility.redactSecrets({ value: node })).toEqual({
      name: 'root',
      self: '[Circular]',
    });
  });
});

describe('NetworkTlsTcpClient - the TLS material never reaches a log line', () => {
  test('the logged options carry no private key, certificate or passphrase', () => {
    const client = new NetworkTlsTcpClient({
      identifier: 'redaction-probe',
      options: TLS_OPTIONS,
    });

    // Exactly what the connect/close log lines render, NOT re-redacted here - otherwise the assertion would pass even against a client that logs its options verbatim; a TLS client's options ARE its private key.
    const logged = JSON.stringify(client['getLoggableOptions']());

    expect(logged).not.toContain('REALLY-SECRET');
    expect(logged).not.toContain('my-passphrase');
    expect(logged).not.toContain('CERTDATA');
    expect(logged).toContain('127.0.0.1');
    expect(logged).toContain('8443');
  });
});
