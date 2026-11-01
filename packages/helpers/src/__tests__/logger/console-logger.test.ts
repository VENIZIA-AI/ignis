import { afterEach, describe, expect, test } from 'bun:test';
import { ConsoleLogger } from '@/modules/logger/base/console';
import { LoggerDebugGate } from '@/modules/logger/common/debug-gate';
import { type ILoggerProvider, LogLevels } from '@/modules/logger/common/types';

type TConsoleMethod = 'debug' | 'log' | 'warn' | 'error';

/** Runs `body` with the console methods recording `method:line`, and gives the lines back. */
const captureConsole = (body: () => void): Array<string> => {
  const lines: Array<string> = [];
  const methods: Array<TConsoleMethod> = ['debug', 'log', 'warn', 'error'];
  const originals = methods.map((method) => console[method]);

  for (const method of methods) {
    console[method] = (message: string) => {
      lines.push(`${method}:${message}`);
    };
  }

  try {
    body();
  } finally {
    methods.forEach((method, index) => {
      console[method] = originals[index];
    });
  }

  return lines;
};

afterEach(() => {
  LoggerDebugGate.force({ isOpen: undefined });
});

describe('ConsoleLogger', () => {
  test('the class itself is an ILoggerProvider', () => {
    const provider: ILoggerProvider = ConsoleLogger;
    expect(provider.get('Probe')).toBeInstanceOf(ConsoleLogger);
  });

  test('get() returns a logger that prefixes its scope', () => {
    const lines = captureConsole(() => ConsoleLogger.get('Probe').info('hello'));
    expect(lines).toEqual(['log:[Probe] hello']);
  });

  test('an empty scope emits no prefix', () => {
    const lines = captureConsole(() => ConsoleLogger.get('').info('bare'));
    expect(lines).toEqual(['log:bare']);
  });

  test('for() derives a child scope', () => {
    const child = ConsoleLogger.get('Parent').for('childMethod');
    expect(child).toBeDefined();

    const lines = captureConsole(() => child.info('nested'));
    expect(lines).toEqual(['log:[Parent-childMethod] nested']);
  });

  test('for() on an empty scope takes the method name as the whole scope', () => {
    const lines = captureConsole(() => ConsoleLogger.get('').for('run').info('x'));
    expect(lines).toEqual(['log:[run] x']);
  });

  test('log() routes by level', () => {
    const lines = captureConsole(() => {
      const logger = ConsoleLogger.get('Probe');
      logger.log(LogLevels.INFO, 'fine');
      logger.log(LogLevels.WARN, 'careful');
      logger.log(LogLevels.ERROR, 'broken');
      logger.log(LogLevels.EMERG, 'down');
    });

    expect(lines).toEqual([
      'log:[Probe] fine',
      'warn:[Probe] careful',
      'error:[Probe] broken',
      'error:[Probe] down',
    ]);
  });

  test('each level method writes to its console sink', () => {
    const lines = captureConsole(() => {
      const logger = ConsoleLogger.get('Probe');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      logger.emerg('m');
    });

    expect(lines).toEqual([
      'log:[Probe] i',
      'warn:[Probe] w',
      'error:[Probe] e',
      'error:[Probe] m',
    ]);
  });
});

describe('ConsoleLogger - the debug gate', () => {
  test('debug() and log(debug) write only while the gate is open', () => {
    LoggerDebugGate.force({ isOpen: true });
    const open = captureConsole(() => {
      ConsoleLogger.get('Probe').debug('shown');
      ConsoleLogger.get('Probe').log(LogLevels.DEBUG, 'shown too');
    });

    LoggerDebugGate.force({ isOpen: false });
    const closed = captureConsole(() => {
      ConsoleLogger.get('Probe').debug('hidden');
      ConsoleLogger.get('Probe').log(LogLevels.DEBUG, 'hidden too');
    });

    expect(open).toEqual(['debug:[Probe] shown', 'debug:[Probe] shown too']);
    expect(closed).toEqual([]);
  });

  test('a closed gate silences debug only: the other levels still write', () => {
    LoggerDebugGate.force({ isOpen: false });
    const lines = captureConsole(() => {
      const logger = ConsoleLogger.get('Probe');
      logger.debug('hidden');
      logger.info('kept');
    });

    expect(lines).toEqual(['log:[Probe] kept']);
  });
});
