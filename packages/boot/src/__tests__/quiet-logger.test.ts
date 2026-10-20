import { QuietLogger } from '@/common/quiet-logger';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { describe, expect, spyOn, test } from 'bun:test';

describe('QuietLogger', () => {
  test('drops debug and info, sends warn and above to stderr, never writes to stdout', () => {
    const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = spyOn(console, 'error').mockImplementation(() => {});

    LoggerFactory.use({ provider: QuietLogger });
    const logger = LoggerFactory.getLogger(['quiet-probe']);
    logger.debug('dropped');
    logger.info('dropped too');
    logger.warn('kept | reason: %s', 'warn');
    logger.for('step').error('kept | reason: %s', 'error');

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(2);
    expect(String(stderr.mock.calls[1]?.[0])).toContain('[quiet-probe-step] kept');

    stdout.mockRestore();
    stderr.mockRestore();
  });
});
