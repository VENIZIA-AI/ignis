import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import pino from 'pino';
import { type AnyType } from '@/common/types';
import {
  AbstractLogger,
  ConsoleLogger,
  type ILogger,
  type ILoggerProvider,
  LoggerDebugGate,
  LoggerFactory,
  LogLevels,
  type TLogLevel,
} from '@/modules/logger';
import { PINO_CUSTOM_LEVELS, PinoBackingLogger, PinoLogger } from '@/modules/logger/pino';
import { WinstonLogger, WinstonLoggerFactory } from '@/modules/logger/winston';

/** From the most to the least severe, the order every call below writes in. */
const LEVELS: Array<TLogLevel> = [
  LogLevels.EMERG,
  LogLevels.ERROR,
  LogLevels.WARN,
  LogLevels.INFO,
  LogLevels.DEBUG,
];

/** What a threshold lets through, written out rather than derived, so the table checks `LogLevels.isEnabled`. */
const LET_THROUGH: Record<TLogLevel, Array<TLogLevel>> = {
  emerg: ['emerg'],
  error: ['emerg', 'error'],
  warn: ['emerg', 'error', 'warn'],
  info: ['emerg', 'error', 'warn', 'info'],
  debug: ['emerg', 'error', 'warn', 'info', 'debug'],
};

const SCOPE = 'Filter';

/** A provider fixture: the provider, and the messages its loggers were handed since the last `drain()`. */
interface IObservedProvider {
  name: string;
  provider: ILoggerProvider;
  /** Whether the provider gates debug itself (`LoggerDebugGate`); a fake one does not. */
  hasOwnDebugGate: boolean;
  drain(): Array<string>;
}

/** A fake provider: no gate of its own, it records every line it is handed. */
class FakeProviderLogger extends AbstractLogger {
  static messages: Array<string> = [];

  static get(_scope: string): FakeProviderLogger {
    return new FakeProviderLogger();
  }

  debug(message: string) {
    FakeProviderLogger.messages.push(message);
  }
  info(message: string) {
    FakeProviderLogger.messages.push(message);
  }
  warn(message: string) {
    FakeProviderLogger.messages.push(message);
  }
  error(message: string) {
    FakeProviderLogger.messages.push(message);
  }
  emerg(message: string) {
    FakeProviderLogger.messages.push(message);
  }
  log(_level: TLogLevel, message: string) {
    FakeProviderLogger.messages.push(message);
  }
  for(): ILogger {
    return this;
  }
}

const stripPrefix = (line: string) => line.replace(`[${SCOPE}] `, '');

const fakeFixture = (): IObservedProvider => ({
  name: 'a fake provider',
  provider: FakeProviderLogger,
  hasOwnDebugGate: false,
  drain: () => FakeProviderLogger.messages.splice(0),
});

/** The console sinks, spied for the whole suite. */
const consoleFixture = (): IObservedProvider & { restore(): void } => {
  const lines: Array<string> = [];
  const spies = (['debug', 'log', 'warn', 'error'] as const).map((method) =>
    spyOn(console, method).mockImplementation((line: string) => {
      lines.push(stripPrefix(line));
    }),
  );

  return {
    name: 'ConsoleLogger',
    provider: ConsoleLogger,
    hasOwnDebugGate: true,
    drain: () => lines.splice(0),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
};

/** WinstonLogger as is, observed by a spy on the default winston instance it writes through. */
const winstonFixture = (): IObservedProvider & { restore(): void } => {
  const lines: Array<string> = [];
  const backing = WinstonLoggerFactory.defaultLogger();
  // Precondition: the backing passes every level, so what is dropped is dropped by the wrapper or the gate.
  expect(backing.level).toBe(LogLevels.DEBUG);
  const spy = spyOn(backing, 'log').mockImplementation(((_level: string, line: string) => {
    lines.push(stripPrefix(line));
    return backing;
  }) as AnyType);

  return {
    name: 'WinstonLogger',
    provider: WinstonLogger,
    hasOwnDebugGate: true,
    drain: () => lines.splice(0),
    restore: () => spy.mockRestore(),
  };
};

/** PinoLogger as is, over a real pino instance writing to memory at level debug. */
const pinoFixture = (): IObservedProvider => {
  const lines: Array<string> = [];
  PinoBackingLogger.set({
    instance: pino({ name: 'APP', level: LogLevels.DEBUG, customLevels: PINO_CUSTOM_LEVELS }, {
      write: (line: string) => lines.push(line),
    } as never) as AnyType,
  });

  return {
    name: 'PinoLogger',
    provider: PinoLogger,
    hasOwnDebugGate: true,
    drain: () => lines.splice(0).map((line) => stripPrefix(JSON.parse(line).msg)),
  };
};

/** Writes one line per level, through the level methods or through `log(level, ...)`, and returns what arrived. */
const writeEveryLevel = (opts: { fixture: IObservedProvider; via: 'method' | 'log' }) => {
  const { fixture, via } = opts;
  fixture.drain();
  const logger = LoggerFactory.getLogger([SCOPE]);

  for (const level of LEVELS) {
    if (via === 'method') {
      logger[level](level);
    } else {
      logger.log(level, level);
    }
  }

  return fixture.drain();
};

const describeProvider = (build: () => IObservedProvider & { restore?(): void }) => {
  let fixture: IObservedProvider & { restore?(): void };

  beforeAll(() => {
    fixture = build();
  });

  afterAll(() => {
    fixture.restore?.();
  });

  afterEach(() => {
    LoggerFactory.reset();
  });

  for (const threshold of LEVELS) {
    for (const via of ['method', 'log'] as const) {
      test(`level ${threshold}, via ${via === 'method' ? 'the level methods' : 'log(level, ...)'}: only ${LET_THROUGH[threshold].join(', ')} reach the provider`, () => {
        LoggerFactory.use({ provider: fixture.provider, level: threshold });
        expect(writeEveryLevel({ fixture, via })).toEqual(LET_THROUGH[threshold]);
      });
    }
  }

  test('no level, gate closed: debug never reaches the provider, with or without a gate of its own', () => {
    LoggerFactory.use({ provider: fixture.provider });
    LoggerDebugGate.force({ isOpen: false });

    expect(writeEveryLevel({ fixture, via: 'method' })).toEqual(LET_THROUGH.info);
    expect(writeEveryLevel({ fixture, via: 'log' })).toEqual(LET_THROUGH.info);
  });

  test('no level, gate open: every level reaches the provider', () => {
    LoggerFactory.use({ provider: fixture.provider });
    LoggerDebugGate.force({ isOpen: true });

    expect(writeEveryLevel({ fixture, via: 'method' })).toEqual(LET_THROUGH.debug);
    expect(writeEveryLevel({ fixture, via: 'log' })).toEqual(LET_THROUGH.debug);
  });
};

describe('LoggerFactory level filtering - a fake provider (no gate of its own)', () => {
  describeProvider(fakeFixture);
});

describe('LoggerFactory level filtering - ConsoleLogger', () => {
  describeProvider(consoleFixture);
});

describe('LoggerFactory level filtering - WinstonLogger', () => {
  describeProvider(winstonFixture);
});

describe('LoggerFactory level filtering - PinoLogger', () => {
  describeProvider(pinoFixture);
});

describe('LoggerFactory level filtering - a level dropped by the wrapper never reaches the provider', () => {
  afterEach(() => {
    LoggerFactory.reset();
  });

  test('a filtered line does not even build the provider logger', () => {
    const scopes: Array<string> = [];
    LoggerFactory.use({
      level: LogLevels.ERROR,
      provider: {
        get: (scope) => {
          scopes.push(scope);
          return FakeProviderLogger.get(scope);
        },
      },
    });
    scopes.length = 0;

    const logger = LoggerFactory.getLogger(['NeverBuilt']);
    logger.info('dropped');
    logger.debug('dropped');
    logger.log(LogLevels.WARN, 'dropped');

    expect(scopes).toEqual([]);
    logger.error('kept');
    expect(scopes).toEqual(['NeverBuilt']);
    FakeProviderLogger.messages.length = 0;
  });

  test('a for() child is filtered by the same level', () => {
    LoggerFactory.use({ provider: FakeProviderLogger, level: LogLevels.WARN });
    FakeProviderLogger.messages.length = 0;

    const child = LoggerFactory.getLogger(['Parent']).for('child');
    child.info('dropped');
    child.warn('kept');

    expect(FakeProviderLogger.messages.splice(0)).toEqual(['kept']);
  });

  test('an unknown level passed to log() is never silenced', () => {
    LoggerFactory.use({ provider: FakeProviderLogger, level: LogLevels.EMERG });
    FakeProviderLogger.messages.length = 0;

    LoggerFactory.getLogger(['Unknown']).log('verbose' as TLogLevel, 'kept');

    expect(FakeProviderLogger.messages.splice(0)).toEqual(['kept']);
  });
});
