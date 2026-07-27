import { describe, expect, test } from 'bun:test';
import { REDACTED, redactSecrets, redactUrlCredentials } from '@/common/redact';

/** Secrets in a log line ship to an aggregator and outlive the process; pins the two shapes a secret arrives in - a KEY in an options object, and the authority section of a URL. */
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
    // The key must not be one SECRET_KEY_PATTERN already matches (`key`, `ca`, `cert`...), or the value is replaced before the Buffer branch is ever reached and this test proves nothing.
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

describe('redactSecrets - the Vault wire spellings the key list must now cover', () => {
  test('the X-Vault-Token header value is redacted', () => {
    const redacted = redactSecrets({
      config: { headers: { 'X-Vault-Token': 'live-token-must-never-log' } },
    }) as { config: { headers: Record<string, unknown> } };

    expect(redacted.config.headers['X-Vault-Token']).toBe(REDACTED);
    expect(JSON.stringify(redacted)).not.toContain('live-token-must-never-log');
  });

  test('AppRole client_token, secret_id and role_id are redacted', () => {
    const redacted = redactSecrets({
      ['client_token']: 'client-token-leak',
      ['secret_id']: 'secret-id-leak',
      ['role_id']: 'role-id-leak',
    }) as Record<string, unknown>;

    expect(redacted['client_token']).toBe(REDACTED);
    expect(redacted['secret_id']).toBe(REDACTED);
    expect(redacted['role_id']).toBe(REDACTED);
  });

  test('any *_token / *Token style key is redacted', () => {
    const redacted = redactSecrets({
      ['access_token']: 'a-leak',
      ['refresh_token']: 'r-leak',
      accessToken: 'camel-leak',
      vaultToken: 'vault-leak',
    }) as Record<string, unknown>;

    expect(redacted['access_token']).toBe(REDACTED);
    expect(redacted['refresh_token']).toBe(REDACTED);
    expect(redacted['accessToken']).toBe(REDACTED);
    expect(redacted['vaultToken']).toBe(REDACTED);
  });

  test('an innocent key that merely ends in "id" is NOT redacted', () => {
    // role_id/secret_id are named secrets; userId/orderId/id are not - the pattern must not swallow ordinary identifier fields.
    const redacted = redactSecrets({
      userId: 'user-42',
      orderId: 'order-7',
      id: 'row-1',
      description: 'a token-based flow',
    }) as Record<string, unknown>;

    expect(redacted['userId']).toBe('user-42');
    expect(redacted['orderId']).toBe('order-7');
    expect(redacted['id']).toBe('row-1');
    expect(redacted['description']).toBe('a token-based flow');
  });
});

describe('redactSecrets - Error awareness keeps the diagnosis, drops the secret', () => {
  test('an AxiosError-shaped object keeps its message but redacts the nested token', () => {
    const axiosError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8200'), {
      config: {
        headers: { 'X-Vault-Token': 'live-token-must-never-log' },
        data: { ['secret_id']: 'approle-secret-must-never-log' },
      },
    });

    const redacted = redactSecrets(axiosError) as {
      name: string;
      message: string;
      stack?: string;
      config: { headers: Record<string, unknown>; data: Record<string, unknown> };
    };

    // The whole point: the rich error survives, minus the secret.
    expect(redacted.message).toBe('connect ECONNREFUSED 127.0.0.1:8200');
    expect(redacted.name).toBe('Error');
    expect(redacted.config.headers['X-Vault-Token']).toBe(REDACTED);
    expect(redacted.config.data['secret_id']).toBe(REDACTED);

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('live-token-must-never-log');
    expect(serialized).not.toContain('approle-secret-must-never-log');
    expect(serialized).toContain('connect ECONNREFUSED');
  });
});

describe('APP_ENV_LOGGER_DO_REDACT=false - the reveal kill-switch', () => {
  const flip = (value: string | undefined, callback: () => void) => {
    const previous = process.env.APP_ENV_LOGGER_DO_REDACT;

    if (value === undefined) {
      delete process.env.APP_ENV_LOGGER_DO_REDACT;
    } else {
      process.env.APP_ENV_LOGGER_DO_REDACT = value;
    }

    try {
      callback();
    } finally {
      if (previous === undefined) {
        delete process.env.APP_ENV_LOGGER_DO_REDACT;
      } else {
        process.env.APP_ENV_LOGGER_DO_REDACT = previous;
      }
    }
  };

  test('the literal string false reveals: redactSecrets becomes the identity function', () => {
    const options = { host: 'db', password: 'hunter2', nested: { token: 'tok_live' } };

    flip('false', () => {
      // Identity, not a copy - the raw reference flows to the sink untouched.
      expect(redactSecrets(options)).toBe(options);
    });
  });

  test('the literal string false reveals: redactUrlCredentials passes the URL through', () => {
    const url = 'postgresql://app:s3cr3t@db:5432/main';

    flip('false', () => {
      expect(redactUrlCredentials(url)).toBe(url);
    });
  });

  test("unset keeps redaction ON - today's default behavior is unchanged", () => {
    flip(undefined, () => {
      const redacted = redactSecrets({ password: 'hunter2' }) as { password: string };

      expect(redacted.password).toBe(REDACTED);
    });
  });

  test('any value other than the literal false keeps redaction ON (fail-closed)', () => {
    for (const value of ['true', 'FALSE', '0', 'no', '']) {
      flip(value, () => {
        const redacted = redactSecrets({ token: 'tok_live' }) as { token: string };

        expect(redacted.token).toBe(REDACTED);
      });
    }
  });

  test('the switch is read per call - flipping back re-enables redaction immediately', () => {
    flip('false', () => {
      expect((redactSecrets({ secret: 's' }) as { secret: string }).secret).toBe('s');
    });

    const redacted = redactSecrets({ secret: 's' }) as { secret: string };

    expect(redacted.secret).toBe(REDACTED);
  });
});
