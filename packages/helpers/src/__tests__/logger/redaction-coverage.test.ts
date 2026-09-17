import { describe, expect, test } from 'bun:test';
import { formatLogMessage } from '@/modules/logger';
import { REDACTED, redactSecrets, toJsonSafe } from '@/common';

/**
 * The `%s` path was already covered. These are the paths that were NOT, and each one leaked a live
 * credential to a log line in the shape the reference docs actually recommend.
 */
describe('formatLogMessage - the placeholders redaction used to miss', () => {
  /** `%o` is what the reference docs recommend for a data object, and it printed secrets verbatim. */
  test('%o redacts', () => {
    const formatted = formatLogMessage({
      message: 'login failed %o',
      args: [{ username: 'alice', password: 'DROP-ME' }],
    });

    expect(formatted).toContain('alice');
    expect(formatted).toContain(REDACTED);
    expect(formatted).not.toContain('DROP-ME');
  });

  test('%O redacts', () => {
    const formatted = formatLogMessage({
      message: 'context %O',
      args: [{ apiKey: 'DROP-ME', requestId: 'req-1' }],
    });

    expect(formatted).toContain('req-1');
    expect(formatted).not.toContain('DROP-ME');
  });

  /** `util.format` appends an argument with no placeholder, which is the most ordinary call there is. */
  test('an argument with NO placeholder redacts', () => {
    const formatted = formatLogMessage({
      message: 'login failed',
      args: [{ username: 'alice', password: 'DROP-ME' }],
    });

    expect(formatted).toContain('alice');
    expect(formatted).not.toContain('DROP-ME');
  });

  /**
   * Redacted but left as an OBJECT. Pre-inspecting these into a string would make `%o` print a
   * quoted, escaped string instead of the object that placeholder means - the redaction is added,
   * the rendering is not changed.
   */
  test('%o still renders as an object, not a quoted string', () => {
    const formatted = formatLogMessage({
      message: 'payload %o',
      args: [{ safe: 'value' }],
    });

    expect(formatted).toContain("safe: 'value'");
    expect(formatted).not.toContain('"{');
  });

  test('a non-secret argument is untouched on every path', () => {
    const messages = ['plain %o', 'plain %O', 'plain'];
    for (const message of messages) {
      expect(formatLogMessage({ message, args: [{ requestId: 'req-9' }] })).toContain('req-9');
    }
  });
});

describe('redactSecrets - key spellings the pattern used to let through', () => {
  const secretKeys = [
    // The `*Secret` counterpart the `*Token` rule always lacked.
    'clientSecret',
    'client_secret',
    'webhookSecret',
    // Connection descriptors, all three common spellings for one thing.
    'connection_string',
    'dsn',
    'database_url',
    'databaseUrl',
    // Prefixed password forms; the bare word was already anchored.
    'dbPassword',
    'admin_password',
  ];

  for (const key of secretKeys) {
    test(`${key} is redacted`, () => {
      const redacted = redactSecrets({ [key]: 'DROP-ME', keep: 'KEEP-ME' }) as Record<
        string,
        unknown
      >;

      expect(redacted[key]).toBe(REDACTED);
      expect(redacted.keep).toBe('KEEP-ME');
    });
  }

  /** The pattern keys on the WHOLE key, so an ordinary word that merely contains one is not eaten. */
  test('ordinary keys are not swallowed', () => {
    const redacted = redactSecrets({
      secretary: 'KEEP-ME',
      passwordPolicy: 'KEEP-ME',
      tokenizer: 'KEEP-ME',
    }) as Record<string, unknown>;

    expect(Object.values(redacted)).toEqual(['KEEP-ME', 'KEEP-ME', 'KEEP-ME']);
  });
});

describe('redactSecrets - the depth bound', () => {
  const buildChain = (levels: number): Record<string, unknown> => {
    const root: Record<string, unknown> = { password: 'DROP-ME' };
    let node = root;

    for (let index = 0; index < levels; index += 1) {
      const next: Record<string, unknown> = { password: 'DROP-ME' };
      node.nested = next;
      node = next;
    }

    return root;
  };

  test('defaults to walking the whole graph', () => {
    const redacted = redactSecrets(buildChain(6)) as Record<string, unknown>;

    expect(redacted.password).toBe(REDACTED);
    expect((redacted.nested as Record<string, unknown>).nested).toBeDefined();
  });

  test('a bound stops the walk instead of doing work the renderer discards', () => {
    const redacted = redactSecrets(buildChain(6), undefined, 2) as Record<string, unknown>;

    // The levels within the bound are still redacted...
    expect(redacted.password).toBe(REDACTED);

    // ...and the walk stopped rather than reaching the bottom of the chain.
    expect(JSON.stringify(redacted).split('nested').length - 1).toBeLessThan(6);
  });

  /** A very deep chain used to blow the stack; the logger's own bound is what keeps it off that path. */
  test('a very deep chain does not throw', () => {
    // 100k, not 20k. The first line asserts a stack overflow HAPPENS, and how much stack is left
    // depends on what else the machine is doing - so the depth has to clear the threshold, not sit
    // on it. Measured on an idle machine: 20k overflowed 19 times in 20, and this test duly failed
    // twice in eight full `make test-all` runs; 100k overflowed 20 in 20, and 50k was already the
    // floor. The whole loop costs ~8ms. A shallower chain proves nothing anyway - it would pass
    // with or without the bound.
    expect(() => redactSecrets(buildChain(100_000))).toThrow(RangeError);
    expect(() => redactSecrets(buildChain(100_000), undefined, 4)).not.toThrow();
  });

  /**
   * The bound has to be applied by every logger path, not just `%s`. The `%o` branch was added in
   * the same change and reached the redactor unbounded, so a call that could never throw before
   * could - on a graph deep enough to blow the recursion.
   */
  test('every logger path bounds the walk, not just %s', () => {
    const deep = buildChain(20_000);

    const messages = ['deep %s', 'deep %o', 'deep %O', 'deep'];
    for (const message of messages) {
      expect(() => formatLogMessage({ message, args: [deep] })).not.toThrow();
    }
  });
});

/**
 * A base64 field turns one request log into hundreds of kilobytes, none of it readable. The cap is
 * STRUCTURAL: `APP_ENV_LOGGER_DO_REDACT=false` is about key masking, never about letting a 300 KB
 * payload through.
 */
describe('a long string is capped, and says how long it was', () => {
  const base64 = 'A'.repeat(5000);

  test('the marker carries the original length', () => {
    const rs = toJsonSafe({ value: { image: `data:image/png;base64,${base64}` } }) as {
      image: string;
    };

    expect(rs.image).toContain('[truncated, 5022 chars total]');
    expect(rs.image.length).toBeLessThan(2200);
  });

  test('a short string is untouched', () => {
    expect(toJsonSafe({ value: { name: 'ordinary' } })).toEqual({ name: 'ordinary' });
  });

  /** A stack trace is the whole reason the line is being read. */
  test('a stack is never capped', () => {
    const stack = `Error: boom\n${'    at somewhere (file.ts:1:1)\n'.repeat(200)}`;
    const rs = toJsonSafe({ value: { stack } }) as { stack: string };

    expect(rs.stack).toBe(stack);
  });

  test('capping survives redaction being turned off', () => {
    const previous = process.env.APP_ENV_LOGGER_DO_REDACT;
    process.env.APP_ENV_LOGGER_DO_REDACT = 'false';

    try {
      expect((toJsonSafe({ value: { blob: base64 } }) as { blob: string }).blob).toContain(
        '[truncated',
      );
    } finally {
      process.env.APP_ENV_LOGGER_DO_REDACT = previous;
    }
  });

  test('the limit is configurable, and 0 keeps everything', () => {
    const previous = process.env.APP_ENV_LOGGER_MAX_STRING_LENGTH;
    process.env.APP_ENV_LOGGER_MAX_STRING_LENGTH = '0';

    try {
      expect((toJsonSafe({ value: { blob: base64 } }) as { blob: string }).blob).toBe(base64);
    } finally {
      process.env.APP_ENV_LOGGER_MAX_STRING_LENGTH = previous;
    }
  });
});
