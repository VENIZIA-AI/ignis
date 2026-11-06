import { describe, expect, test } from 'bun:test';
import { REDACTED, RedactUtility } from '@/common/redact';

/** Secrets in a log line ship to an aggregator and outlive the process; pins the two shapes a secret arrives in - a KEY in an options object, and the authority section of a URL. */
describe('redactUrlCredentials', () => {
  test('a broker URL keeps its host and user but loses the password', () => {
    const redacted = RedactUtility.redactUrlCredentials({
      url: 'mqtts://ingest:hunter2@broker.internal:8883',
    });

    expect(redacted).not.toContain('hunter2');
    expect(redacted).toContain(REDACTED);
    // The host and the user are what make the log line useful - they must survive.
    expect(redacted).toContain('broker.internal:8883');
    expect(redacted).toContain('ingest');
  });

  test('a URL with no password is returned untouched', () => {
    const url = 'mqtt://broker.internal:1883';

    expect(RedactUtility.redactUrlCredentials({ url })).toBe(url);
  });

  test('a non-URL string is returned untouched, not blanked', () => {
    // Blanking it would hide the very value the operator opened the log to see.
    expect(RedactUtility.redactUrlCredentials({ url: 'not a url at all' })).toBe(
      'not a url at all',
    );
  });

  test('a postgres-style URL is handled the same way', () => {
    const redacted = RedactUtility.redactUrlCredentials({
      url: 'postgresql://app:s3cr3t@db:5432/main',
    });

    expect(redacted).not.toContain('s3cr3t');
    expect(redacted).toContain('db:5432');
  });
});

describe('redactSecrets - the shapes a TLS/MQTT options object actually takes', () => {
  test('a TLS private key, passphrase and cert are all redacted, host is kept', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        host: '10.0.0.7',
        port: 8883,
        key: '-----BEGIN PRIVATE KEY-----MIIEvg...',
        passphrase: 'hunter2',
        cert: '-----BEGIN CERTIFICATE-----MIID...',
        password: 'hunter2',
      },
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
    const redacted = RedactUtility.redactSecrets({
      value: {
        payload: Buffer.from('-----BEGIN CERTIFICATE-----'),
      },
    }) as Record<string, unknown>;

    expect(redacted.payload).toBe('[Binary 27 bytes]');
    expect(JSON.stringify(redacted)).not.toContain('BEGIN CERTIFICATE');
  });

  test('a secret nested inside another object is still found', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        connection: { tls: { privateKey: 'leak-me' } },
      },
    });

    expect(JSON.stringify(redacted)).not.toContain('leak-me');
  });
});

describe('redactSecrets - the Vault wire spellings the key list must now cover', () => {
  test('the X-Vault-Token header value is redacted', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        config: { headers: { 'X-Vault-Token': 'live-token-must-never-log' } },
      },
    }) as { config: { headers: Record<string, unknown> } };

    expect(redacted.config.headers['X-Vault-Token']).toBe(REDACTED);
    expect(JSON.stringify(redacted)).not.toContain('live-token-must-never-log');
  });

  test('AppRole client_token, secret_id and role_id are redacted', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        ['client_token']: 'client-token-leak',
        ['secret_id']: 'secret-id-leak',
        ['role_id']: 'role-id-leak',
      },
    }) as Record<string, unknown>;

    expect(redacted['client_token']).toBe(REDACTED);
    expect(redacted['secret_id']).toBe(REDACTED);
    expect(redacted['role_id']).toBe(REDACTED);
  });

  test('any *_token / *Token style key is redacted', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        ['access_token']: 'a-leak',
        ['refresh_token']: 'r-leak',
        accessToken: 'camel-leak',
        vaultToken: 'vault-leak',
      },
    }) as Record<string, unknown>;

    expect(redacted['access_token']).toBe(REDACTED);
    expect(redacted['refresh_token']).toBe(REDACTED);
    expect(redacted['accessToken']).toBe(REDACTED);
    expect(redacted['vaultToken']).toBe(REDACTED);
  });

  test('credential, credentials and any *_credential / *Credential key are redacted', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        credential: 'c-leak',
        credentials: 'cs-leak',
        dbCredential: 'db-leak',
        ['api_credential']: 'api-leak',
        dbCredentials: 'dbs-leak',
        ['api_credentials']: 'apis-leak',
        Credential: 'upper-leak',
      },
    }) as Record<string, unknown>;

    for (const key of Object.keys(redacted)) {
      expect(redacted[key]).toBe(REDACTED);
    }
  });

  test('a key that ends in credential is redacted even as a flag, like *Token and *Secret', () => {
    const redacted = RedactUtility.redactSecrets({
      value: { hasCredential: 'yes', noCredentials: false },
    }) as Record<string, unknown>;

    expect(redacted['hasCredential']).toBe(REDACTED);
    expect(redacted['noCredentials']).toBe(REDACTED);
  });

  test('an ordinary key that only contains "credential" is NOT redacted', () => {
    const redacted = RedactUtility.redactSecrets({
      value: {
        credentialType: 'oauth2',
        credentialed: true,
        credentialsUrl: 'https://example.com/credentials',
      },
    }) as Record<string, unknown>;

    expect(redacted['credentialType']).toBe('oauth2');
    expect(redacted['credentialed']).toBe(true);
    expect(redacted['credentialsUrl']).toBe('https://example.com/credentials');
  });

  test('an innocent key that merely ends in "id" is NOT redacted', () => {
    // role_id/secret_id are named secrets; userId/orderId/id are not - the pattern must not swallow ordinary identifier fields.
    const redacted = RedactUtility.redactSecrets({
      value: {
        userId: 'user-42',
        orderId: 'order-7',
        id: 'row-1',
        description: 'a token-based flow',
      },
    }) as Record<string, unknown>;

    expect(redacted['userId']).toBe('user-42');
    expect(redacted['orderId']).toBe('order-7');
    expect(redacted['id']).toBe('row-1');
    expect(redacted['description']).toBe('a token-based flow');
  });
});

describe('redactSecrets - a function is named, never carried', () => {
  test('an own toJSON cannot add keys after the walk', () => {
    const redacted = RedactUtility.redactSecrets({
      value: { blob: { toJSON: () => ({ apiKey: 'TOJSON_SECRET' }) }, ok: 1 },
    });

    expect(JSON.stringify(redacted)).not.toContain('TOJSON_SECRET');
    expect(JSON.stringify(redacted)).toBe('{"blob":{"toJSON":"[Function]"},"ok":1}');
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

    const redacted = RedactUtility.redactSecrets({ value: axiosError }) as {
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
      expect(RedactUtility.redactSecrets({ value: options })).toBe(options);
    });
  });

  test('the literal string false reveals: redactUrlCredentials passes the URL through', () => {
    const url = 'postgresql://app:s3cr3t@db:5432/main';

    flip('false', () => {
      expect(RedactUtility.redactUrlCredentials({ url })).toBe(url);
    });
  });

  test('force: true masks redactSecrets even with the switch set to false', () => {
    const options = { host: 'db', password: 'hunter2', nested: { token: 'tok_live' } };

    flip('false', () => {
      const masked = RedactUtility.redactSecrets({ value: options, force: true }) as {
        host: string;
        password: string;
        nested: { token: string };
      };

      expect(masked).not.toBe(options);
      expect(masked.host).toBe('db');
      expect(masked.password).toBe(REDACTED);
      expect(masked.nested.token).toBe(REDACTED);
      // The logger path passes no force and still follows the switch.
      expect(RedactUtility.redactSecrets({ value: options })).toBe(options);
    });
  });

  test('force: true strips redactUrlCredentials and masks toJsonSafe with the switch set to false', () => {
    const url = 'postgresql://app:s3cr3t@db:5432/main';

    flip('false', () => {
      expect(RedactUtility.redactUrlCredentials({ url, force: true })).not.toContain('s3cr3t');
      expect(RedactUtility.redactUrlCredentials({ url })).toBe(url);

      const safe = RedactUtility.toJsonSafe({ value: { apiKey: 'k-live' }, force: true }) as {
        apiKey: string;
      };

      expect(safe.apiKey).toBe(REDACTED);
      expect(
        (RedactUtility.toJsonSafe({ value: { apiKey: 'k-live' } }) as { apiKey: string }).apiKey,
      ).toBe('k-live');
    });
  });

  test('force: true with the switch unset masks, as it does without force', () => {
    flip(undefined, () => {
      const masked = RedactUtility.redactSecrets({ value: { token: 'tok_live' }, force: true }) as {
        token: string;
      };

      expect(masked.token).toBe(REDACTED);
    });
  });

  test('force: true masks keys only - the projection still caps strings and breaks repeated references', () => {
    const address = { city: 'Hanoi' };
    const note = 'a'.repeat(3000);

    flip('false', () => {
      const out = RedactUtility.redactSecrets({
        value: { billing: address, shipping: address, note, number: '4111', password: 'p' },
        force: true,
      }) as Record<string, unknown>;

      expect(out.password).toBe(REDACTED);
      // Not a faithful document: a card number under a non-secret key is kept, a long string is cut, and the
      // second reference to the same object is a cycle marker.
      expect(out.number).toBe('4111');
      expect(String(out.note).length).toBeLessThan(note.length);
      expect(out.shipping).toBe('[Circular]');
    });
  });

  test('force: false or absent leaves the switch in charge', () => {
    flip('false', () => {
      const options = { password: 'hunter2' };

      expect(RedactUtility.redactSecrets({ value: options, force: false })).toBe(options);
    });
  });

  test("unset keeps redaction ON - today's default behavior is unchanged", () => {
    flip(undefined, () => {
      const redacted = RedactUtility.redactSecrets({ value: { password: 'hunter2' } }) as {
        password: string;
      };

      expect(redacted.password).toBe(REDACTED);
    });
  });

  test('any value other than the literal false keeps redaction ON (fail-closed)', () => {
    const items = ['true', 'FALSE', '0', 'no', ''];

    for (const value of items) {
      flip(value, () => {
        const redacted = RedactUtility.redactSecrets({ value: { token: 'tok_live' } }) as {
          token: string;
        };

        expect(redacted.token).toBe(REDACTED);
      });
    }
  });

  test('the switch is read per call - flipping back re-enables redaction immediately', () => {
    flip('false', () => {
      expect(
        (RedactUtility.redactSecrets({ value: { secret: 's' } }) as { secret: string }).secret,
      ).toBe('s');
    });

    const redacted = RedactUtility.redactSecrets({ value: { secret: 's' } }) as { secret: string };

    expect(redacted.secret).toBe(REDACTED);
  });
});

describe('redactSecrets - more credential names and the credentials inside string values', () => {
  const mask = (value: unknown) => RedactUtility.redactSecrets({ value, force: true });

  test.each([
    'secretAccessKey',
    'awsSecretAccessKey',
    'signingKey',
    'signing_key',
    'encryptionKey',
    'masterKey',
    'hmacKey',
    'accountKey',
    'storageKey',
    'licenseKey',
    'resetKey',
    'resetCode',
    'verificationCode',
    'authorization_code',
    'jwt',
    'JWT',
    'sessionId',
    'session_id',
    'sid',
    'signature',
    'sig',
    'x-amz-signature',
    'x-amz-security-token',
    'id-token',
    'refresh-token',
    'client-secret',
    'private-key',
    'passwd',
    'pwd',
    'passcode',
    'pass_phrase',
    'secretAnswer',
    'otp',
    'totp',
    'cvv',
    'cvc',
    'cardNumber',
    'card_number',
    'ssn',
    'nationalId',
    'redisUrl',
    'mongoUri',
  ])('the key %s is masked', (key) => {
    const masked = mask({ [key]: 'VALUE' }) as Record<string, unknown>;

    expect(masked[key]).toBe(REDACTED);
  });

  test.each(['primaryKey', 'cacheKey', 'code', 'statusCode', 'pin', 'identifier', 'description'])(
    'the key %s stays visible',
    (key) => {
      const masked = mask({ [key]: 'VALUE' }) as Record<string, unknown>;

      expect(masked[key]).toBe('VALUE');
    },
  );

  test('a url with a password in a harmless key loses the password, keeps the rest', () => {
    const masked = mask({ target: 'postgres://app:hunter2@db:5432/main' }) as Record<
      string,
      string
    >;

    expect(masked.target).toBe('postgres://app:[REDACTED]@db:5432/main');
  });

  test('a url inside a sentence is scrubbed, and so is an Authorization value', () => {
    const masked = mask({
      note: 'connect to redis://u:p4ss@cache:6379 failed, header Authorization: Bearer eyJhbGciOi.abc.def',
    }) as Record<string, string>;

    expect(masked.note).not.toContain('p4ss');
    expect(masked.note).not.toContain('eyJhbGciOi');
    expect(masked.note).toContain('redis://u:[REDACTED]@cache:6379');
    expect(masked.note).toContain('Bearer [REDACTED]');
  });

  test('credential query parameters in a link are masked, the others are kept', () => {
    const masked = mask({
      link: 'https://x.test/cb?access_token=abc123&page=2&signature=zzz&code=AUTH',
    }) as Record<string, string>;

    expect(masked.link).toBe(
      'https://x.test/cb?access_token=[REDACTED]&page=2&signature=[REDACTED]&code=[REDACTED]',
    );
  });

  test('an Error message and stack are scrubbed too', () => {
    const error = new Error('cannot reach mongodb://admin:s3cr3t@mongo:27017/app');
    const masked = mask({ error }) as { error: { message: string; stack?: string } };

    expect(masked.error.message).toBe('cannot reach mongodb://admin:[REDACTED]@mongo:27017/app');
    expect(masked.error.stack ?? '').not.toContain('s3cr3t');
  });

  test('plain text is left alone', () => {
    const masked = mask({ message: 'user a@b.com signed in, 3 items' }) as Record<string, string>;

    expect(masked.message).toBe('user a@b.com signed in, 3 items');
  });

  test('with the switch off and no force, strings are not scrubbed', () => {
    const previous = process.env.APP_ENV_LOGGER_DO_REDACT;
    process.env.APP_ENV_LOGGER_DO_REDACT = 'false';

    try {
      const value = { target: 'postgres://app:hunter2@db/main' };

      expect(RedactUtility.redactSecrets({ value })).toBe(value);
    } finally {
      if (previous === undefined) {
        delete process.env.APP_ENV_LOGGER_DO_REDACT;
      } else {
        process.env.APP_ENV_LOGGER_DO_REDACT = previous;
      }
    }
  });
});
