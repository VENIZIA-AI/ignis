import { describe, expect, test } from 'bun:test';
import { inspect } from 'node:util';
import { getError } from '@/modules/error';
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

  /** The first dependency frame is often the throw site (drizzle, jose); the rest is HTTP plumbing. */
  test('keeps app frames and only the FIRST dependency frame, counting off the rest', () => {
    const error = new Error('boom');
    error.stack = [
      'Error: boom',
      '    at recalculate (/app/src/sale-order.service.ts:88:21)',
      '    at queryWithCache (/app/node_modules/drizzle-orm/session.js:66:33)',
      '    at dispatch (/app/node_modules/hono/compose.js:43:23)',
      '    at notify (/app/node_modules/hono/hono-base.js:327:31)',
      '    at handler (/app/src/controller.ts:12:5)',
    ].join('\n');

    const stack = ErrorPrettier.summarize({ error }).stack ?? '';

    expect(stack).toContain('sale-order.service.ts');
    expect(stack).toContain('drizzle-orm/session.js'); // the first dependency frame survives
    expect(stack).toContain('controller.ts'); // a later APP frame is never dropped
    expect(stack).not.toContain('compose.js');
    expect(stack).toContain('... 2 dependency frames'); // never truncated silently
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

  /** A ZodError's `message` is its issue array as pretty JSON - dozens of lines for one bad field. */
  test('compresses a ZodError message to one `path: reason` line per issue', () => {
    const error = Object.assign(
      new Error(
        JSON.stringify([
          { path: ['order', 'items', 0, 'qty'], message: 'expected number, received string' },
          { path: [], code: 'custom' },
        ]),
      ),
      { name: 'ZodError' },
    );

    expect(ErrorPrettier.summarize({ error }).message).toBe(
      'order.items.0.qty: expected number, received string\n(root): custom',
    );
  });

  test('counts off ZodError issues beyond the cap instead of truncating silently', () => {
    const issues = Array.from({ length: 14 }, (_unused, index) => ({
      path: [`field${index}`],
      message: 'required',
    }));
    const error = Object.assign(new Error(JSON.stringify(issues)), { name: 'ZodError' });

    const message = ErrorPrettier.summarize({ error }).message ?? '';

    expect(message.split('\n')).toHaveLength(11); // 10 issues + the count line
    expect(message).toContain('... and 4 more');
  });

  test('leaves a ZodError alone when its message is not the JSON issue form', () => {
    const error = Object.assign(new Error('totally not json'), { name: 'ZodError' });

    expect(ErrorPrettier.summarize({ error }).message).toBe('totally not json');
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

  /** `formatLogMessage` routes every Error through the prettifier, so the baseline is a raw `util.inspect` - what the log line used to be. */
  test('the summary is far shorter than inspecting the raw error', () => {
    const error = buildDrizzleError();

    const raw = inspect(error, { depth: 5, breakLength: Infinity });
    const summarized = formatLogMessage({ message: 'Error: %s', args: [error] });

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
    expect(block).toContain('message: Failed query:');
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
      inspect(error, { depth: 5, breakLength: Infinity }).split(needle).length - 1;
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

    expect(block).toBe('- message: flat failure');
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
    expect(ErrorPrettier.format({ error: 'boom' })).toBe('- message: boom');
  });
});

/** `%{placeholder}` stays raw by design - i18n resolves it downstream - so the log must carry the values separately or a reader cannot tell WHICH field failed. */
describe('ErrorPrettier and normalized args', () => {
  const buildImmutableFieldError = () =>
    getError({
      message: {
        text: 'Field %{field} is fixed at creation and cannot be changed.',
        code: 'server.core.inventory.ticket.update.immutable_field',
        args: { field: 'ticketType' },
      },
      statusCode: 400,
    });

  test('summarize exposes normalized args', () => {
    const summary = ErrorPrettier.summarize({ error: buildImmutableFieldError() });

    expect(summary.args).toEqual({ field: 'ticketType' });
  });

  test('format renders the args beside the unresolved template', () => {
    const block = ErrorPrettier.format({
      error: buildImmutableFieldError(),
      messageCode: 'server.core.inventory.ticket.update.immutable_field',
      includeStack: false,
    });

    expect(block).toContain('message: Field %{field} is fixed at creation and cannot be changed.');
    expect(block).toContain("args: { field: 'ticketType' }");
  });

  test('args come immediately after the message they fill in', () => {
    const block = ErrorPrettier.format({
      error: buildImmutableFieldError(),
      includeStack: false,
    });
    const lines = block.split('\n');

    expect(lines[0]).toContain('message:');
    expect(lines[1]).toContain('args:');
  });

  test('an empty args map adds no line - every getError without args would carry one', () => {
    const error = getError({ message: { text: 'Nothing to fill', code: 'server.core.plain' } });
    const block = ErrorPrettier.format({ error, includeStack: false });

    expect(block).not.toContain('args:');
  });

  test('redacts a secret-named key inside args', () => {
    const error = getError({
      message: {
        text: 'Login failed for %{email}',
        code: 'server.core.auth.login.failed',
        args: { email: 'a@b.com', password: 'hunter2' },
      },
    });
    const block = ErrorPrettier.format({ error, includeStack: false });

    expect(block).toContain('[REDACTED]');
    expect(block).not.toContain('hunter2');
  });

  test('normalized.code reaches the summary - only AppErrorMiddleware passes messageCode by hand', () => {
    const error = getError({
      message: { text: 'Ticket is closed', code: 'server.core.inventory.ticket.closed' },
    });

    expect(ErrorPrettier.summarize({ error }).messageCode).toBe(
      'server.core.inventory.ticket.closed',
    );
    expect(ErrorPrettier.format({ error, includeStack: false })).toContain(
      'code: server.core.inventory.ticket.closed',
    );
  });

  test('the DEFAULT code is not surfaced - every codeless error would carry a noise line', () => {
    const error = getError({ message: 'Something went wrong' });

    expect(ErrorPrettier.summarize({ error }).messageCode).toBeUndefined();
    expect(ErrorPrettier.format({ error, includeStack: false })).not.toContain('core.system_error');
  });

  /** A driver's `23505` and a message code are different things; folding them would print one as the other. */
  test("an error's own code stays separate from its message code", () => {
    const error = Object.assign(getError({ message: { text: 'x', code: 'server.core.a.b' } }), {
      code: '23505',
    });
    const summary = ErrorPrettier.summarize({ error });

    expect(summary.code).toBe('23505');
    expect(summary.messageCode).toBe('server.core.a.b');
  });

  test("a caller-supplied messageCode still wins over the error's own", () => {
    const error = getError({ message: { text: 'x', code: 'server.core.a.b' } });
    const block = ErrorPrettier.format({
      error,
      messageCode: 'server.core.caller.wins',
      includeStack: false,
    });

    expect(block).toContain('code: server.core.caller.wins');
    expect(block).not.toContain('server.core.a.b');
  });

  test('a cause does not hoist its args to the root - the root owns the message being filled', () => {
    const inner = getError({
      message: { text: 'inner %{a}', code: 'server.core.inner', args: { a: 'INNER' } },
    });
    const outer = Object.assign(new Error('outer'), { cause: inner });
    const block = ErrorPrettier.format({ error: outer, includeStack: false });

    expect(block).not.toContain('INNER');
  });
});

/** The throw site is what a 4xx line is missing; the framework's own factory frame is not it. */
describe('ErrorPrettier stack budget', () => {
  const throwFromService = () => {
    throw getError({ message: { text: 'Ticket is closed', code: 'server.core.ticket.closed' } });
  };

  const captured = () => {
    try {
      throwFromService();
    } catch (error) {
      return error;
    }
    throw new Error('unreachable');
  };

  test('no frame points into the error factory - it costs a slot and names no call site', () => {
    const summary = ErrorPrettier.summarize({ error: captured() });

    expect(summary.stack).toBeDefined();
    expect(summary.stack).not.toContain('modules/error/app-error');
    expect(summary.stack).toContain('throwFromService');
  });

  test('format forwards maxStackFrames - callers were pinned at the default', () => {
    const block = ErrorPrettier.format({ error: captured(), maxStackFrames: 1 });
    const frames = (block.split('stack:\n')[1] ?? '')
      .split('\n')
      .filter(line => line.includes(' at '));

    expect(frames).toHaveLength(1);
  });
});

/** A multi-line block becomes one record per line in a log monitor, so the error loses its context. */
describe('ErrorPrettier JSON rendering', () => {
  const buildError = () =>
    getError({
      message: {
        text: 'Field %{field} is fixed at creation and cannot be changed.',
        code: 'server.core.inventory.ticket.update.immutable_field',
        args: { field: 'ticketType' },
      },
      statusCode: 400,
    });

  test('json renders ONE physical line', () => {
    const line = ErrorPrettier.format({ error: buildError(), format: 'json' });

    expect(line.split('\n')).toHaveLength(1);
  });

  test('a message with real newlines stays on one line', () => {
    const error = new Error('Failed query:\n  SELECT 1\nparams: a,b');
    const line = ErrorPrettier.format({ error, format: 'json', includeStack: false });

    expect(line.split('\n')).toHaveLength(1);
    expect(JSON.parse(line).message).toContain('SELECT 1');
  });

  test('carries message, args and code as fields', () => {
    const payload = JSON.parse(
      ErrorPrettier.format({ error: buildError(), format: 'json', includeStack: false }),
    );

    expect(payload.message).toBe('Field %{field} is fixed at creation and cannot be changed.');
    expect(payload.args).toEqual({ field: 'ticketType' });
    expect(payload.code).toBe('server.core.inventory.ticket.update.immutable_field');
  });

  test('stack is an ARRAY of frames, not a joined string', () => {
    const payload = JSON.parse(ErrorPrettier.format({ error: buildError(), format: 'json' }));

    expect(Array.isArray(payload.stack)).toBe(true);
    expect(payload.stack[0]).toContain(' (');
  });

  test('absent fields are omitted, never null', () => {
    const payload = JSON.parse(
      ErrorPrettier.format({ error: new Error('flat'), format: 'json', includeStack: false }),
    );

    expect('args' in payload).toBe(false);
    expect('code' in payload).toBe(false);
    expect('extra' in payload).toBe(false);
  });

  test('redacts secret-named keys in args and extra, exactly as text does', () => {
    const error = getError({
      message: {
        text: 'Login failed for %{email}',
        code: 'server.core.auth.login.failed',
        args: { email: 'a@b.com', password: 'hunter2' },
      },
    });
    const line = ErrorPrettier.format({
      error,
      format: 'json',
      extra: { token: 'sk-live-abc' },
      includeStack: false,
    });

    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('sk-live-abc');
    expect(line).toContain('[REDACTED]');
  });

  test('text stays the bullet block - json is opt-in through the format', () => {
    const block = ErrorPrettier.format({
      error: buildError(),
      format: 'text',
      includeStack: false,
    });

    expect(block.startsWith('- message: ')).toBe(true);
    expect(() => JSON.parse(block)).toThrow();
  });
});

/** `format` runs inside the error handler. Throwing there turns a handled failure into an unhandled one. */
describe('ErrorPrettier JSON resilience', () => {
  const buildCircular = () => {
    const value: Record<string, unknown> = { orderId: 'ord-1' };
    value.self = value;
    return value;
  };

  test('a cyclic extra does not throw - JSON.stringify alone would', () => {
    const line = ErrorPrettier.format({
      error: new Error('boom'),
      extra: buildCircular(),
      includeStack: false,
      format: 'json',
    });

    expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(line).extra.self).toBe('[Circular]');
  });

  test('a cyclic args does not throw either', () => {
    const error = getError({ message: { text: 'x %{a}', code: 'server.core.x.y' } });
    (error.normalized.args as Record<string, unknown>).a = buildCircular();

    const line = ErrorPrettier.format({ error, includeStack: false, format: 'json' });

    expect(() => JSON.parse(line)).not.toThrow();
  });

  test('the non-cyclic payload is untouched - resilience must not degrade the common case', () => {
    const line = ErrorPrettier.format({
      error: new Error('boom'),
      extra: { orderId: 'ord-1', nested: { qty: 2 } },
      includeStack: false,
      format: 'json',
    });

    expect(JSON.parse(line).extra).toEqual({ orderId: 'ord-1', nested: { qty: 2 } });
  });
});

/** The factory-frame filter must name IGNIS's own file, not any file that happens to sit at the same path. */
describe('ErrorPrettier factory-frame filter precision', () => {
  const frameStack = (frames: Array<string>) =>
    Object.assign(new Error('boom'), { stack: ['Error: boom', ...frames].join('\n') });

  test("an application's own modules/error/app-error is NOT swallowed", () => {
    const error = frameStack([
      '    at assertThing (/app/src/modules/error/app-error.ts:12:9)',
      '    at handler (/app/src/controller.ts:5:3)',
    ]);

    const stack = ErrorPrettier.summarize({ error }).stack ?? '';

    expect(stack).toContain('/app/src/modules/error/app-error.ts');
  });

  test("IGNIS's own factory frame is swallowed, installed or in the monorepo", () => {
    const error = frameStack([
      '    at getError (/app/node_modules/@venizia/ignis-inversion/dist/cjs/modules/error/app-error.js:56:20)',
      '    at getError (/repo/packages/inversion/dist/esm/modules/error/app-error.js:50:20)',
      '    at updateTicket (/app/src/ticket.service.ts:8:11)',
    ]);

    const stack = ErrorPrettier.summarize({ error }).stack ?? '';

    expect(stack).not.toContain('app-error');
    expect(stack).toContain('ticket.service.ts');
  });
});
