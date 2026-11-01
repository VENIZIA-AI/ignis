import { describe, expect, test } from 'bun:test';
import { PACKAGE_ROOT } from '../package-root';
import { SpawnHelper } from '@venizia/dev-configs/testing';

/**
 * A browser app installs its logger through `@venizia/ignis-helpers/core`: `LoggerFactory` is node-only. The slot is
 * process-global, so each case runs in a fresh process and prints one `RESULT:` line.
 */
const run = (body: string): string => {
  const probe = `
    const seen = [];
    for (const method of ['debug', 'log', 'info', 'warn', 'error']) {
      console[method] = (...parts) => { seen.push(method + ':' + parts.join(' ')); };
    }
    const quiet = (logger) => ({
      debug: () => undefined,
      info: (message, ...args) => logger.info(message, ...args),
      warn: (message, ...args) => logger.warn(message, ...args),
      error: (message, ...args) => logger.error(message, ...args),
      emerg: (message, ...args) => logger.emerg(message, ...args),
      log: (level, message, ...args) => logger.log(level, message, ...args),
      for: (name) => quiet(logger.for(name)),
    });
    ${body}
    process.stdout.write('RESULT:' + JSON.stringify(seen) + '\\n');
  `;

  const result = SpawnHelper.spawnSyncBounded({
    cmd: ['bun', '-e', probe],
    cwd: PACKAGE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const line = result.stdout
    .toString()
    .split('\n')
    .find((text) => text.startsWith('RESULT:'));

  if (!line) {
    throw new Error(`[core-logger-slot] no result | stderr: ${result.stderr.toString()}`);
  }

  return line.slice('RESULT:'.length);
};

describe('@venizia/ignis-helpers/core: the browser-safe logger seam', () => {
  test('the core entry exports LoggerSlot, ConsoleLogger and the resolver type', () => {
    const result = run(`
      const core = await import('./src/core.ts');
      seen.push(typeof core.LoggerSlot?.use, typeof core.ConsoleLogger?.get);
    `);

    expect(JSON.parse(result)).toEqual(['function', 'function']);
  });

  test('a resolver installed before the first line decides what a helper writes: debug is silenced, the rest is not', () => {
    const result = run(`
      const { BaseHelper, ConsoleLogger, LoggerSlot } = await import('./src/core.ts');
      LoggerSlot.use({
        resolver: ({ scopes }) => quiet(ConsoleLogger.get({ scope: scopes.join('-') })),
      });
      const helper = new BaseHelper({ scope: 'Probe' });
      helper.logger.debug('hidden');
      helper.logger.info('shown');
      helper.logger.for('run').debug('hidden too');
      helper.logger.for('run').error('failed');
    `);

    expect(JSON.parse(result)).toEqual(['log:[Probe] shown', 'error:[Probe-run] failed']);
  });

  test('a helper that logged before a resolver existed switches to it on its next line', () => {
    const result = run(`
      const { BaseHelper, ConsoleLogger, LoggerSlot } = await import('./src/core.ts');
      const helper = new BaseHelper({ scope: 'Early' });
      helper.logger.debug('first');
      LoggerSlot.use({
        resolver: ({ scopes }) => quiet(ConsoleLogger.get({ scope: scopes.join('-') })),
      });
      helper.logger.debug('second');
      helper.logger.info('third');
    `);

    // Under Node the console fallback warns once that no provider is installed; a browser does not.
    expect(JSON.parse(result)).toEqual([
      expect.stringContaining('no logger provider is installed'),
      'debug:[Early] first',
      'log:[Early] third',
    ]);
  });

  test('the logger a helper resolved on its first line is the one it keeps', () => {
    const result = run(`
      const { BaseHelper, ConsoleLogger, LoggerSlot } = await import('./src/core.ts');
      LoggerSlot.use({ resolver: ({ scopes }) => ConsoleLogger.get({ scope: scopes.join('-') }) });
      const helper = new BaseHelper({ scope: 'Kept' });
      helper.logger.debug('before');
      LoggerSlot.use({
        resolver: ({ scopes }) => quiet(ConsoleLogger.get({ scope: scopes.join('-') })),
      });
      helper.logger.debug('after');
    `);

    expect(JSON.parse(result)).toEqual(['debug:[Kept] before', 'debug:[Kept] after']);
  });
});
