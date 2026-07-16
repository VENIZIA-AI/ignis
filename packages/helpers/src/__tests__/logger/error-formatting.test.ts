import { describe, expect, test } from 'bun:test';
import { getError } from '@/modules/error';
import { formatLogMessage } from '@/modules/logger/formatters';

/**
 * `message` and `stack` are NON-ENUMERABLE on an Error, so `JSON.stringify` - and therefore `%j` -
 * silently drops both. An error logged with `%j` reaches the log file without the stack, which is
 * the field the line exists for. This is the rule every error log line in the framework follows:
 * `%s`.
 *
 * The message text does survive `%j`, but only incidentally - it rides along inside the enumerable
 * `extra.message.text`, not as `Error.message`. That is a side effect of the structured message, not
 * a licence to use `%j`: the stack is still gone.
 */
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

  test('%s keeps the message, the stack AND the enumerable fields', () => {
    const formatted = formatLogMessage({ message: 'Error: %s', args: [buildError()] });

    expect(formatted).toContain('boom');
    expect(formatted).toContain('at '); // a stack frame
    expect(formatted).toContain('core.mail.send_failed');
    expect(formatted).toContain('23505');
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
