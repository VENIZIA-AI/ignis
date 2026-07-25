import { describe, expect, test } from 'bun:test';
import { ErrorPrettier, formatLogMessage } from '@/modules/logger';

/** A drizzle-shaped failure: a huge SQL `message` plus `query`/`params`/`stack` that each repeat it, wrapping a raw pg error as `cause` - the shape that floods the log. */
const buildDrizzleError = () => {
  const sql = 'UPDATE "sale"."SaleOrder"\n  SET total = 1\n  WHERE id = $1';
  const pgCause = Object.assign(
    new Error('cannot update table "SaleOrder" because it does not have a replica identity'),
    {
      code: '55000',
      severity: 'ERROR',
      hint: 'To enable updating the table, set REPLICA IDENTITY using ALTER TABLE.',
      file: 'execReplication.c',
    },
  );

  return Object.assign(new Error(`Failed query: ${sql}\nparams: abc,abc`), {
    query: sql,
    params: ['abc', 'abc'],
    cause: pgCause,
  });
};

describe('ErrorPrettier.summarize', () => {
  test('keeps name, message and code; drops query and params', () => {
    const summary = ErrorPrettier.summarize({ error: buildDrizzleError() });

    expect(summary.name).toBe('Error');
    expect(summary.message).toContain('Failed query:');
    expect('query' in summary).toBe(false);
    expect('params' in summary).toBe(false);
  });

  test('keeps the stack as FRAMES ONLY - the header would repeat the message', () => {
    const summary = ErrorPrettier.summarize({ error: buildDrizzleError() });

    expect(summary.stack).toBeDefined();
    expect(summary.stack).toContain(' at ');
    // The header line carries the whole SQL message; only frames survive.
    expect(summary.stack).not.toContain('Failed query:');
  });

  test('skips the stack entirely when includeStack is false', () => {
    const summary = ErrorPrettier.summarize({ error: buildDrizzleError(), includeStack: false });

    expect(summary.stack).toBeUndefined();
  });

  test('caps the frames at maxStackFrames', () => {
    const summary = ErrorPrettier.summarize({ error: buildDrizzleError(), maxStackFrames: 2 });

    expect(summary.stack?.split('\n')).toHaveLength(2);
  });

  test('keeps the pg diagnostics when the driver supplies them', () => {
    const summary = ErrorPrettier.summarize({ error: buildDrizzleError() });

    expect(summary.cause?.hint).toContain('REPLICA IDENTITY');
  });

  test('keeps the message in full - no truncation', () => {
    const long = 'x'.repeat(5_000);
    const summary = ErrorPrettier.summarize({ error: new Error(long) });

    expect(summary.message).toBe(long);
  });

  test('flattens the cause to its message and code, not the whole object', () => {
    const cause = ErrorPrettier.summarize({ error: buildDrizzleError() }).cause ?? {};

    expect(cause.message).toContain('replica identity');
    expect(cause.code).toBe('55000');
    // The noisy pg internals never survive; `hint` does, being actionable.
    expect('severity' in cause).toBe(false);
    expect('file' in cause).toBe(false);
  });

  test('bounds the cause chain at maxCauseDepth', () => {
    const root = new Error('root') as Error & { cause?: unknown };
    const mid = new Error('mid') as Error & { cause?: unknown };
    const top = new Error('top') as Error & { cause?: unknown };
    top.cause = mid;
    mid.cause = root;

    const summary = ErrorPrettier.summarize({ error: top, maxCauseDepth: 1 });

    expect(summary.cause?.message).toBe('mid');
    // Depth 1 stops here: `mid`'s own cause is not followed.
    expect(summary.cause?.cause).toBeUndefined();
  });

  test('survives a circular cause chain', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b') as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;

    const summary = ErrorPrettier.summarize({ error: a });

    // a -> b -> (a already seen) collapses to a marker instead of recursing forever.
    expect(summary.cause?.message).toBe('b');
    expect(summary.cause?.cause?.message).toBe('[Circular]');
  });

  test('wraps a primitive thrown value as its message', () => {
    expect(ErrorPrettier.summarize({ error: 'boom' }).message).toBe('boom');
    expect(ErrorPrettier.summarize({ error: 42 }).message).toBe('42');
  });

  test('an unmodelled cause shape reaches the log inspected, not dropped', () => {
    const error = Object.assign(new Error('wrapper'), { cause: { failedIds: [7, 9] } });

    expect(ErrorPrettier.summarize({ error }).cause?.message).toBe('{ failedIds: [ 7, 9 ] }');
  });

  test('redacts a secret-named key inside an unmodelled cause shape', () => {
    const error = Object.assign(new Error('wrapper'), { cause: { token: 'sk-live-abc' } });
    const message = ErrorPrettier.summarize({ error }).cause?.message;

    expect(message).toContain('[REDACTED]');
    expect(message).not.toContain('sk-live-abc');
  });

  test('the summarized error logs far shorter than the raw one via %s', () => {
    const error = buildDrizzleError();

    const raw = formatLogMessage({ message: 'Error: %s', args: [error] });
    const summarized = formatLogMessage({
      message: 'Error: %s',
      args: [ErrorPrettier.summarize({ error })],
    });

    expect(summarized.length).toBeLessThan(raw.length);
    // The one useful reason still reaches the log.
    expect(summarized).toContain('replica identity');
  });
});

describe('ErrorPrettier.format', () => {
  test('renders the cause reason with its code, then the message', () => {
    const block = ErrorPrettier.format({ error: buildDrizzleError() });

    expect(block).toContain(
      'cause: cannot update table "SaleOrder" because it does not have a replica identity (code 55000)',
    );
    expect(block).toContain('message:\nFailed query:');
  });

  test('renders the message with REAL newlines, not escaped \\n', () => {
    const block = ErrorPrettier.format({ error: buildDrizzleError() });

    // The SQL block spans real lines - proof the message is not inspected as a nested string.
    expect(block.split('\n').length).toBeGreaterThan(5);
    expect(block).not.toContain('\\n');
  });

  /** The whole point: the raw error embeds the statement in `message`, `stack` AND `query`. */
  test('the SQL statement appears exactly ONCE, not once per field', () => {
    const error = buildDrizzleError();
    const needle = 'SET total = 1';

    const rawOccurrences =
      formatLogMessage({ message: '%s', args: [error] }).split(needle).length - 1;
    const blockOccurrences = ErrorPrettier.format({ error }).split(needle).length - 1;

    expect(rawOccurrences).toBeGreaterThan(1);
    expect(blockOccurrences).toBe(1);
  });

  test('omits the stack when includeStack is false', () => {
    const block = ErrorPrettier.format({ error: buildDrizzleError(), includeStack: false });

    expect(block).not.toContain('stack:');
    expect(block).toContain('message:');
  });

  test('renders the caller messageCode and extra, redacting a secret-named key', () => {
    const block = ErrorPrettier.format({
      error: new Error('Order not found'),
      messageCode: 'server.sale.order.not_found',
      extra: { orderId: 'ord-991', token: 'sk-live-abc' },
    });

    expect(block).toContain('code: server.sale.order.not_found');
    expect(block).toContain("orderId: 'ord-991'");
    expect(block).toContain('[REDACTED]');
    expect(block).not.toContain('sk-live-abc');
  });

  test('omits code and extra lines when the caller supplies neither', () => {
    const block = ErrorPrettier.format({ error: new Error('flat'), includeStack: false });

    expect(block).not.toContain('code:');
    expect(block).not.toContain('extra:');
  });

  test('a bare `name: Error` is dropped - it says nothing', () => {
    const block = ErrorPrettier.format({ error: new Error('flat failure'), includeStack: false });

    expect(block).toBe('message:\nflat failure');
  });

  test('keeps the name when it is specific', () => {
    const block = ErrorPrettier.format({ error: new TypeError('bad access'), includeStack: false });

    expect(block).toContain('name: TypeError');
  });

  test('keeps a generic name when it carries a code', () => {
    const error = Object.assign(new Error('grpc down'), { code: 14 });
    const block = ErrorPrettier.format({ error, includeStack: false });

    expect(block).toContain('name: Error (code 14)');
  });

  test('an unmodelled cause shape is rendered, never an empty `cause:` line', () => {
    const error = Object.assign(new Error('wrapper'), { cause: { failedIds: [7, 9] } });
    const block = ErrorPrettier.format({ error, includeStack: false });

    expect(block).toContain('cause: { failedIds: [ 7, 9 ] }');
    expect(block).not.toContain('cause: \n');
  });

  test('renders a primitive thrown value as a message', () => {
    expect(ErrorPrettier.format({ error: 'boom' })).toBe('message:\nboom');
  });
});
