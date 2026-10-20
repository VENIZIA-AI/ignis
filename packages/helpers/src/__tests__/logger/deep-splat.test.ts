import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { formatLogMessage } from '@/modules/logger';

/** `util.format` hard-codes `depth: 0` for `%s` and no inspect option overrides it, collapsing cause / driver payload / `extra` to `[Object]` - so the arg must be inspected into a string before it reaches `%s`. */
const buildDeepError = () => {
  const error = new Error('boom') as Error & { statusCode?: number; extra?: unknown };
  error.statusCode = 400;
  error.extra = { level1: { level2: { level3: { leaf: 'DEEP_LEAF' } } } };

  return error;
};

describe('formatLogMessage - %s is widened to full depth', () => {
  test('a nested value under %s is printed, not collapsed to [Object]', () => {
    const formatted = formatLogMessage({
      message: 'Failed | Error: %s',
      args: [buildDeepError()],
    });

    expect(formatted).toContain('DEEP_LEAF');
    expect(formatted).not.toContain('[Object]');
  });

  test('an explicit depth caps it again - the Node default (2) hides the leaf', () => {
    const formatted = formatLogMessage({
      message: 'Failed | Error: %s',
      args: [buildDeepError()],
      inspectOptions: { depth: 2 },
    });

    expect(formatted).not.toContain('DEEP_LEAF');
  });

  test('a long array under %s is not truncated with "... more items"', () => {
    const formatted = formatLogMessage({
      message: 'Items: %s',
      args: [{ items: Array.from({ length: 200 }, (_, index) => index) }],
    });

    expect(formatted).toContain('199');
    expect(formatted).not.toContain('more item');
  });
});

/** Nests `depth` objects and puts the leaf at the bottom, so a depth cap is directly observable. */
const buildNested = (opts: { depth: number }): Record<string, unknown> => {
  let node: Record<string, unknown> = { leaf: 'DEEP_LEAF' };

  for (let level = 0; level < opts.depth; level++) {
    node = { nested: node };
  }

  return node;
};

describe('formatLogMessage - the default inspect depth', () => {
  const withDepthEnv = (value: string | undefined, run: () => void) => {
    const original = process.env.APP_ENV_LOGGER_INSPECT_DEPTH;

    if (value === undefined) {
      delete process.env.APP_ENV_LOGGER_INSPECT_DEPTH;
    } else {
      process.env.APP_ENV_LOGGER_INSPECT_DEPTH = value;
    }

    try {
      run();
    } finally {
      if (original === undefined) {
        delete process.env.APP_ENV_LOGGER_INSPECT_DEPTH;
      } else {
        process.env.APP_ENV_LOGGER_INSPECT_DEPTH = original;
      }
    }
  };

  test('reaches 5 levels down with no env set', () => {
    withDepthEnv(undefined, () => {
      const formatted = formatLogMessage({ message: '%s', args: [buildNested({ depth: 5 })] });

      expect(formatted).toContain('DEEP_LEAF');
    });
  });

  test('an ABSENT env must not read as depth 0 - the setting that hides everything', () => {
    withDepthEnv(undefined, () => {
      const formatted = formatLogMessage({ message: '%s', args: [{ one: { two: 'VISIBLE' } }] });

      expect(formatted).toContain('VISIBLE');
    });
  });

  test('past 5 levels the tail collapses, so a huge graph cannot flood one line', () => {
    withDepthEnv(undefined, () => {
      const formatted = formatLogMessage({ message: '%s', args: [buildNested({ depth: 8 })] });

      expect(formatted).not.toContain('DEEP_LEAF');
      expect(formatted).toContain('[Object]');
    });
  });

  test('a NEGATIVE env value is a misconfiguration - it falls back to the default, never unlimited', () => {
    withDepthEnv('-1', () => {
      const shallow = formatLogMessage({ message: '%s', args: [buildNested({ depth: 5 })] });
      const deep = formatLogMessage({ message: '%s', args: [buildNested({ depth: 20 })] });

      // Exactly the default's behaviour: 5 levels visible, past that collapsed.
      expect(shallow).toContain('DEEP_LEAF');
      expect(deep).not.toContain('DEEP_LEAF');
    });
  });

  test('a non-numeric env value also falls back to the default', () => {
    withDepthEnv('deep-please', () => {
      const formatted = formatLogMessage({ message: '%s', args: [buildNested({ depth: 5 })] });

      expect(formatted).toContain('DEEP_LEAF');
    });
  });

  test('an explicit env value caps it', () => {
    withDepthEnv('2', () => {
      const formatted = formatLogMessage({ message: '%s', args: [buildNested({ depth: 5 })] });

      expect(formatted).not.toContain('DEEP_LEAF');
    });
  });
});

describe('formatLogMessage - the other placeholders keep their meaning', () => {
  test('%j still emits JSON, NOT a quoted inspect string', () => {
    const formatted = formatLogMessage({
      message: 'Payload: %j',
      args: [{ a: { b: 'c' } }],
    });

    // Widening every argument (instead of only the %s ones) would produce `"{ a: { b: 'c' } }"`.
    expect(formatted).toBe('Payload: {"a":{"b":"c"}}');
  });

  test('%s with a primitive is untouched, and %d still formats a number', () => {
    expect(formatLogMessage({ message: '%s | %d', args: ['plain', 42] })).toBe('plain | 42');
  });

  test('placeholders are matched POSITIONALLY - a %j before a %s keeps both correct', () => {
    const formatted = formatLogMessage({
      message: 'J: %j | S: %s',
      args: [{ a: 1 }, { deep: { leaf: 'DEEP_LEAF' } }],
    });

    expect(formatted).toContain('J: {"a":1}');
    expect(formatted).toContain('DEEP_LEAF');
  });

  test('%% is an escape, not a placeholder - it must not shift the argument mapping', () => {
    const formatted = formatLogMessage({
      message: '100%% done | S: %s',
      args: [{ deep: { leaf: 'DEEP_LEAF' } }],
    });

    expect(formatted).toContain('DEEP_LEAF');
  });

  test('an argument with no placeholder is still appended, as util.format does', () => {
    const formatted = formatLogMessage({ message: 'no placeholder', args: [{ a: 1 }] });

    expect(formatted).toContain('no placeholder');
    expect(formatted).toContain('a: 1');
  });

  test('a circular object does not throw - it renders as [Circular]', () => {
    const circular: AnyType = { name: 'root' };
    circular.self = circular;

    const formatted = formatLogMessage({ message: 'Obj: %s', args: [circular] });

    expect(formatted).toContain('Circular');
  });
});

/** `JSON.stringify` gives up on the WHOLE payload when a cycle sits anywhere inside it, and it never redacts - so a `%j` argument has to be projected before `util.format` hands it over. */
describe('formatLogMessage - %j is projected before JSON.stringify sees it', () => {
  const buildCyclicTransaction = () => {
    const transaction: AnyType = { id: 'tx-1' };
    transaction.client = { pool: transaction };

    return transaction;
  };

  test('a cycle collapses only its own branch, not the whole argument', () => {
    const formatted = formatLogMessage({
      message: 'Args: %j',
      args: [{ userId: 42, transaction: buildCyclicTransaction() }],
    });

    expect(formatted).toContain('"userId":42');
    expect(formatted).toContain('"id":"tx-1"');
    expect(formatted).toContain('[Circular]');
  });

  test('a secret-looking key is redacted under %j, as it already is under %s', () => {
    const formatted = formatLogMessage({
      message: 'Args: %j',
      args: [{ username: 'phatnt', password: 'hunter2', accessToken: 'ey.j' }],
    });

    expect(formatted).toContain('"username":"phatnt"');
    expect(formatted).not.toContain('hunter2');
    expect(formatted).not.toContain('ey.j');
  });

  test('an Error under %j keeps its message instead of serializing to {}', () => {
    const formatted = formatLogMessage({
      message: 'Args: %j',
      args: [{ error: new Error('boom') }],
    });

    expect(formatted).toContain('boom');
  });

  test('a Date under %j stays an ISO string', () => {
    const formatted = formatLogMessage({ message: 'Args: %j', args: [{ createdAt: new Date(0) }] });

    expect(formatted).toBe('Args: {"createdAt":"1970-01-01T00:00:00.000Z"}');
  });

  test('the same Date used twice is not mistaken for a cycle', () => {
    const createdAt = new Date(0);
    const formatted = formatLogMessage({
      message: 'Args: %j',
      args: [{ createdAt, updatedAt: createdAt }],
    });

    expect(formatted).not.toContain('Circular');
  });

  test('%j is capped at the same depth as %s, so a live connector cannot flood the sink', () => {
    const formatted = formatLogMessage({
      message: 'Args: %j',
      args: [buildNested({ depth: 12 })],
      inspectOptions: { depth: 2 },
    });

    expect(formatted).not.toContain('DEEP_LEAF');
    expect(formatted).toContain('[Object]');
  });

  test('a Date under %s is printed, not flattened to {}', () => {
    const formatted = formatLogMessage({ message: 'Args: %s', args: [{ createdAt: new Date(0) }] });

    expect(formatted).toContain('1970-01-01T00:00:00.000Z');
  });
});
