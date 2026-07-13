import { describe, expect, test } from 'bun:test';
import { REDACTED, redactSecrets } from '@/common/redact';
import type { AnyType } from '@/common/types';
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
    const redacted = redactSecrets({
      host: 'db.internal',
      port: 5432,
      auth: { user: 'app', password: 'hunter2' },
      nested: [{ apiKey: 'abc123', label: 'keep' }],
    }) as AnyType;

    expect(redacted.host).toBe('db.internal');
    expect(redacted.port).toBe(5432);
    expect(redacted.auth).toBe(REDACTED);
    expect(redacted.nested[0].apiKey).toBe(REDACTED);
    expect(redacted.nested[0].label).toBe('keep');
  });

  test('a Buffer-valued secret is summarized, never serialized', () => {
    const redacted = redactSecrets({ key: Buffer.from('private-key-bytes') }) as AnyType;

    expect(redacted.key).toBe(REDACTED);
  });

  test('a circular structure does not hang', () => {
    const node: AnyType = { name: 'root' };
    node.self = node;

    expect(redactSecrets(node)).toEqual({ name: 'root', self: '[Circular]' });
  });
});

describe('NetworkTlsTcpClient - the TLS material never reaches a log line', () => {
  test('the logged options carry no private key, certificate or passphrase', () => {
    const client = new NetworkTlsTcpClient({
      identifier: 'redaction-probe',
      options: TLS_OPTIONS as AnyType,
    } as AnyType);

    // Exactly what the connect/close log lines render - NOT re-redacted here, or the assertion
    // would pass even against a client that logs its options verbatim. A TLS client's options ARE
    // its private key: logging them writes the key into every log file and aggregator downstream.
    const logged = JSON.stringify(client['getLoggableOptions']());

    expect(logged).not.toContain('REALLY-SECRET');
    expect(logged).not.toContain('my-passphrase');
    expect(logged).not.toContain('CERTDATA');
    expect(logged).toContain('127.0.0.1');
    expect(logged).toContain('8443');
  });
});
