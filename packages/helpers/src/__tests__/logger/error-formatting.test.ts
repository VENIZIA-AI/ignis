import { describe, expect, test } from 'bun:test';
import { getError } from '@/modules/error';
import { formatLogMessage } from '@/modules/logger';

/** `Error.message`/`stack` are non-enumerable, so raw `JSON.stringify` drops both - the `%j` path projects the error first, so a mistaken `%j` still carries them. `%s` stays the rule: only it routes through `ErrorPrettier`, which projects unmodelled own properties away. */
describe('logging an Error - %s is the rule, %j is no longer a silent loss', () => {
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

  test('%j keeps the message and the stack, which JSON.stringify alone would drop', () => {
    const formatted = formatLogMessage({ message: 'Error: %j', args: [buildError()] });

    expect(formatted).toContain('boom');
    expect(formatted).toContain('at '); // a stack frame
    expect(formatted).toContain('core.mail.send_failed');
  });

  /** The reason the rule survives: `%j` carries every enumerable own property, so a driver's `query` or a `jose` payload rides along. */
  test('%j still dumps unmodelled own properties - %s projects them away', () => {
    const error = buildError();
    (error as unknown as Record<string, unknown>).query = 'SELECT secret FROM users';

    expect(formatLogMessage({ message: 'Error: %j', args: [error] })).toContain('SELECT secret');
    expect(formatLogMessage({ message: 'Error: %s', args: [error] })).not.toContain(
      'SELECT secret',
    );
  });

  test('a nested cause under %s survives the default depth', () => {
    const error = getError({ message: 'outer' });
    error.cause = getError({ message: 'inner', messageCode: 'core.search_engine.not_found' });

    const formatted = formatLogMessage({ message: 'Error: %s', args: [error] });

    expect(formatted).toContain('inner');
  });
});
