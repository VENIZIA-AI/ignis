import { describe, expect, test } from 'bun:test';
import { getError } from '@/modules/error';
import { formatLogMessage } from '@/modules/logger/formatters';

/**
 * `message` and `stack` are NON-ENUMERABLE on an Error, so `JSON.stringify` - and therefore `%j` -
 * silently drops both. An error logged with `%j` reaches the log file without the two fields the
 * line exists for. This is the rule every error log line in the framework follows: `%s`.
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

  test('%j loses the message and the stack - this is why no error log line may use it', () => {
    const formatted = formatLogMessage({ message: 'Error: %j', args: [buildError()] });

    expect(formatted).not.toContain('boom');
    expect(formatted).not.toContain('at ');
    // Only the enumerable own properties survive.
    expect(formatted).toContain('core.mail.send_failed');
  });

  test('a nested cause under %s survives the default depth', () => {
    const error = getError({ message: 'outer' });
    error.cause = getError({ message: 'inner', messageCode: 'core.search_engine.not_found' });

    const formatted = formatLogMessage({ message: 'Error: %s', args: [error] });

    expect(formatted).toContain('inner');
  });
});
