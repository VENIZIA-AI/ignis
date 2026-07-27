import { describe, expect, test } from 'bun:test';
import { getError } from '@/modules/error';
import { formatLogMessage } from '@/modules/logger';

/** `Error.message`/`stack` are non-enumerable, so `%j` silently drops both - always log errors with `%s`; `%j` keeps only incidental message text via `extra.message.text`. */
describe('logging an Error - %s keeps it, %j guts it', () => {
  const buildError = () => {
    const error = getError({
      message: 'boom',
      statusCode: 500,
      messageCode: 'core.mail.send_failed',
    });
    error.cause = { sqlState: '23505', detail: 'Key (email) already exists' };

    return error;
  };

  /** `%s` routes an Error through `ErrorPrettier`: message, cause and frames survive; unmodelled own properties are projected away, which is what stops a driver dumping its whole query or `jose` its whole JWT payload. */
  test('%s keeps the message, the cause and the stack', () => {
    const formatted = formatLogMessage({ message: 'Error: %s', args: [buildError()] });

    expect(formatted).toContain('boom');
    expect(formatted).toContain('at '); // a stack frame
    expect(formatted).toContain('Key (email) already exists'); // the cause's own message
  });

  test('%j loses the stack - this is why no error log line may use it', () => {
    const formatted = formatLogMessage({ message: 'Error: %j', args: [buildError()] });

    expect(formatted).not.toContain('at '); // no stack frame - the reason the rule exists
    // `Error.message` itself is gone: the text below comes from the enumerable `extra.message`.
    expect(formatted).toContain('core.mail.send_failed');
    expect(formatted).toContain('boom');
  });

  test('a nested cause under %s survives the default depth', () => {
    const error = getError({ message: 'outer' });
    error.cause = getError({ message: 'inner', messageCode: 'core.search_engine.not_found' });

    const formatted = formatLogMessage({ message: 'Error: %s', args: [error] });

    expect(formatted).toContain('inner');
  });
});
