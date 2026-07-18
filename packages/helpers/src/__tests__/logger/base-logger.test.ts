import { describe, expect, test } from 'bun:test';
import { AnyType } from '@/common/types';
import { toBoolean } from '@/utilities/parse.utility';
import { BaseLogger, ILogger, TLogLevel } from '@/modules/logger';

/** Minimal recording sink - the same shape a future provider (pino) would implement. */
class RecordingLogger extends BaseLogger {
  writes: Array<{ level: TLogLevel; message: string; args: Array<AnyType> }> = [];

  constructor(opts: { scope: string }) {
    super(opts);
  }

  protected write(opts: { level: TLogLevel; message: string; args: Array<AnyType> }): void {
    this.writes.push(opts);
  }

  protected child(opts: { scope: string }): ILogger {
    return new RecordingLogger(opts);
  }
}

describe('BaseLogger - level dispatch to the single write() sink', () => {
  test('each level method dispatches with its own level', () => {
    const logger = new RecordingLogger({ scope: 'DispatchTest' });

    logger.info('a');
    logger.warn('b');
    logger.error('c');
    logger.emerg('d');
    logger.log('warn', 'e', 1, 2);

    expect(logger.writes.map(w => w.level)).toEqual(['info', 'warn', 'error', 'emerg', 'warn']);
    expect(logger.writes[4]).toEqual({ level: 'warn', message: 'e', args: [1, 2] });
  });

  test('every LogLevels entry has a direct ILogger method', () => {
    const logger: ILogger = new RecordingLogger({ scope: 'FullSurface' });
    const levelNames = ['debug', 'info', 'warn', 'error', 'emerg'] as const;
    for (const level of levelNames) {
      expect(typeof logger[level]).toBe('function');
    }
  });

  test('the scope prefix is exposed the way WinstonLogger renders it', () => {
    const logger = new RecordingLogger({ scope: 'PrefixTest' });
    expect(logger['_formattedPrefix']).toBe('[PrefixTest] ');
    expect(logger['_scope']).toBe('PrefixTest');
  });

  test('debug() honors the module-load DEBUG gate', () => {
    const logger = new RecordingLogger({ scope: 'DebugGate' });
    logger.debug('gated');

    // .env.test does not set DEBUG, so in the standard test run the gate suppresses the line.
    // If a developer shell exports DEBUG=true the gate opens - assert consistently with it.
    const expected = toBoolean(process.env.DEBUG) ? 1 : 0;
    expect(logger.writes.length).toBe(expected);
  });

  test('an empty scope produces NO prefix bracket', () => {
    const logger = new RecordingLogger({ scope: '' });
    expect(logger['_formattedPrefix']).toBe('');
    expect(logger['_scope']).toBe('');
  });

  test('for() composes the child scope with a dash', () => {
    const logger = new RecordingLogger({ scope: 'Parent' });
    const child = logger.for('method') as RecordingLogger;

    expect(child['_scope']).toBe('Parent-method');

    child.info('x');
    expect(child.writes.length).toBe(1);
    expect(logger.writes.length).toBe(0);
  });
});
