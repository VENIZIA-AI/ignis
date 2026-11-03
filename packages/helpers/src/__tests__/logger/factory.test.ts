import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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
import { WinstonLogger } from '@/modules/logger/winston';

/** Minimal recording provider, shaped for assertions. */
class RecordingProviderLogger extends AbstractLogger {
  static writes: Array<{ scope: string; level: TLogLevel; message: string }> = [];
  private static cache = new Map<string, RecordingProviderLogger>();

  private constructor(private readonly scope: string) {
    super();
  }

  static get(scope: string): RecordingProviderLogger {
    let logger = this.cache.get(scope);
    if (!logger) {
      logger = new RecordingProviderLogger(scope);
      this.cache.set(scope, logger);
    }
    return logger;
  }

  private record(level: TLogLevel, message: string) {
    RecordingProviderLogger.writes.push({ scope: this.scope, level, message });
  }

  debug(message: string) {
    this.record('debug', message);
  }
  info(message: string) {
    this.record('info', message);
  }
  warn(message: string) {
    this.record('warn', message);
  }
  error(message: string) {
    this.record('error', message);
  }
  emerg(message: string) {
    this.record('emerg', message);
  }
  log(level: TLogLevel, message: string) {
    this.record(level, message);
  }
  for(methodName: string): ILogger {
    return RecordingProviderLogger.get(`${this.scope}-${methodName}`);
  }
}

/** Runs `body` with `console.log` recording its lines. */
const captureConsoleLog = (body: () => void): Array<string> => {
  const lines: Array<string> = [];
  const original = console.log;
  console.log = (message: string) => lines.push(message);

  try {
    body();
  } finally {
    console.log = original;
  }

  return lines;
};

/**
 * A provider whose every logger records `scope|message` into `seen`, and which records the scope of each `get` call.
 * `use()` re-points every wrapper this file created, so a case reads only the scopes it owns.
 */
const buildCountingProvider = () => {
  const state = { scopes: new Array<string>(), seen: new Array<string>() };
  const provider: ILoggerProvider = {
    get: (scope: string) => {
      state.scopes.push(scope);
      return {
        info: (message: string) => state.seen.push(`${scope}|${message}`),
      } as unknown as ILogger;
    },
  };
  const getsFor = (scope: string) => state.scopes.filter((seen) => seen === scope).length;
  return { state, provider, getsFor };
};

// The slots are process-global and other suites in the run may leave a provider chosen: start every case clean.
beforeEach(() => {
  LoggerFactory.reset();
});

afterEach(() => {
  LoggerFactory.reset();
  RecordingProviderLogger.writes.length = 0;
});

describe('LoggerFactory - the default provider', () => {
  test('default provider is ConsoleLogger, resolved LAZILY on the first log call', () => {
    const wrapper = LoggerFactory.getLogger(['SwapDefault']) as AnyType;
    // No delegate yet - construction must not touch a provider.
    expect(wrapper['_delegate']).toBeUndefined();
    expect(LoggerFactory.isChosen()).toBe(false);

    captureConsoleLog(() => wrapper.info('resolve now'));

    expect(LoggerFactory.currentProvider()).toBe(ConsoleLogger);
    expect(wrapper['_delegate']).toBeInstanceOf(ConsoleLogger);
  });

  test('without a chosen provider a line goes to the console, scopes joined', () => {
    const lines = captureConsoleLog(() => {
      LoggerFactory.getLogger(['Alpha', 'Beta']).info('fallback');
    });

    expect(lines).toEqual(['[Alpha-Beta] fallback']);
  });

  test('empty scope parts are skipped when the scope is joined', () => {
    const lines = captureConsoleLog(() => {
      LoggerFactory.getLogger(['', 'Only', '']).info('x');
      LoggerFactory.getLogger([]).info('bare');
    });

    expect(lines).toEqual(['[Only] x', 'bare']);
  });

  test('no level is set by default', () => {
    expect(LoggerFactory.currentLevel()).toBeUndefined();
  });
});

describe('LoggerFactory - swap-on-use provider registration', () => {
  test('RecordingProviderLogger satisfies the ILoggerProvider contract LoggerFactory.use() accepts', () => {
    const provider: ILoggerProvider = RecordingProviderLogger;
    LoggerFactory.use({ provider });
    expect(LoggerFactory.currentProvider()).toBe(provider);
    expect(LoggerFactory.isChosen()).toBe(true);
  });

  test('a chosen provider takes over and is handed the joined scope', () => {
    const { state, provider, getsFor } = buildCountingProvider();
    LoggerFactory.use({ provider });

    LoggerFactory.getLogger(['Gamma', 'Delta']).info('routed');

    expect(getsFor('Gamma-Delta')).toBe(1);
    expect(state.seen).toEqual(['Gamma-Delta|routed']);
  });

  test('a wrapper captured BEFORE use() follows the provider registered after', () => {
    const captured = LoggerFactory.getLogger(['SwapEarly']); // module-level capture simulation
    LoggerFactory.use({ provider: RecordingProviderLogger });
    captured.info('routed late');
    expect(RecordingProviderLogger.writes).toContainEqual({
      scope: 'SwapEarly',
      level: 'info',
      message: 'routed late',
    });
  });

  test('a wrapper that already wrote to the console upgrades in place once a provider is chosen', () => {
    const resolved = LoggerFactory.getLogger(['Upgrade']);
    const before = captureConsoleLog(() => resolved.info('before registration'));
    expect(before).toEqual(['[Upgrade] before registration']);

    LoggerFactory.use({ provider: RecordingProviderLogger });
    const after = captureConsoleLog(() => resolved.info('after registration'));

    expect(after).toEqual([]);
    expect(RecordingProviderLogger.writes).toEqual([
      { scope: 'Upgrade', level: 'info', message: 'after registration' },
    ]);
  });

  test('wrappers created AFTER use() resolve from the new provider', () => {
    LoggerFactory.use({ provider: RecordingProviderLogger });
    LoggerFactory.getLogger(['SwapLate']).warn('fresh');
    expect(RecordingProviderLogger.writes).toContainEqual({
      scope: 'SwapLate',
      level: 'warn',
      message: 'fresh',
    });
  });

  test('for() children swap with the parent', () => {
    const parent = LoggerFactory.getLogger(['SwapParent']);
    const child = parent.for('handle'); // captured pre-use
    LoggerFactory.use({ provider: RecordingProviderLogger });
    child.error('child routed');
    expect(RecordingProviderLogger.writes).toContainEqual({
      scope: 'SwapParent-handle',
      level: 'error',
      message: 'child routed',
    });
  });

  test('for() on an empty scope takes the method name as the whole scope', () => {
    LoggerFactory.use({ provider: RecordingProviderLogger });
    LoggerFactory.getLogger([]).for('run').info('x');
    expect(RecordingProviderLogger.writes).toEqual([{ scope: 'run', level: 'info', message: 'x' }]);
  });

  test('use() is idempotent, re-callable, and eagerly re-points EXISTING wrappers', () => {
    const wrapper = LoggerFactory.getLogger(['SwapBack']) as AnyType;
    LoggerFactory.use({ provider: RecordingProviderLogger });
    LoggerFactory.use({ provider: RecordingProviderLogger });
    expect(wrapper['_delegate']).toBe(RecordingProviderLogger.get('SwapBack'));
    LoggerFactory.use({ provider: WinstonLogger });
    expect(wrapper['_delegate']).toBe(WinstonLogger.get('SwapBack'));
  });

  test('the provider builds a logger once per choice, not once per log call', () => {
    const resolved = LoggerFactory.getLogger(['CacheHit']);
    const first = buildCountingProvider();
    LoggerFactory.use({ provider: first.provider });

    resolved.info('one');
    resolved.info('two');
    resolved.info('three');
    expect(first.getsFor('CacheHit')).toBe(1);

    const second = buildCountingProvider();
    LoggerFactory.use({ provider: second.provider });
    resolved.info('four');

    expect(first.getsFor('CacheHit')).toBe(1);
    expect(second.getsFor('CacheHit')).toBe(1);
    expect(second.state.seen).toEqual(['CacheHit|four']);
  });

  test('getLogger identity is stable per scope across calls', () => {
    expect(LoggerFactory.getLogger(['SwapIdentity'])).toBe(
      LoggerFactory.getLogger(['SwapIdentity']),
    );
  });

  test('a level-only use() keeps the provider and chooses none', () => {
    LoggerFactory.use({ level: LogLevels.WARN });
    expect(LoggerFactory.currentLevel()).toBe(LogLevels.WARN);
    expect(LoggerFactory.isChosen()).toBe(false);
    expect(LoggerFactory.currentProvider()).toBe(ConsoleLogger);

    LoggerFactory.use({ provider: RecordingProviderLogger });
    LoggerFactory.use({ level: LogLevels.ERROR });
    expect(LoggerFactory.currentProvider()).toBe(RecordingProviderLogger);
    expect(LoggerFactory.currentLevel()).toBe(LogLevels.ERROR);
  });
});

describe('LoggerFactory.useUnlessChosen', () => {
  test('chooses the provider when none is chosen', () => {
    LoggerFactory.useUnlessChosen({ provider: RecordingProviderLogger });
    expect(LoggerFactory.currentProvider()).toBe(RecordingProviderLogger);
  });

  test('never overrides a provider the application chose', () => {
    const { provider } = buildCountingProvider();
    LoggerFactory.use({ provider });
    LoggerFactory.useUnlessChosen({ provider: RecordingProviderLogger });
    expect(LoggerFactory.currentProvider()).toBe(provider);
  });
});

describe('LoggerFactory.reset', () => {
  test('restores the console, unchooses the provider and clears the level', () => {
    const wrapper = LoggerFactory.getLogger(['Delta']);
    LoggerFactory.use({ provider: RecordingProviderLogger, level: LogLevels.ERROR });
    LoggerFactory.reset();

    expect(LoggerFactory.isChosen()).toBe(false);
    expect(LoggerFactory.currentProvider()).toBe(ConsoleLogger);
    expect(LoggerFactory.currentLevel()).toBeUndefined();

    const lines = captureConsoleLog(() => wrapper.info('back'));
    expect(lines).toEqual(['[Delta] back']);
    expect(RecordingProviderLogger.writes).toEqual([]);
  });

  test('clears the debug override a level set', () => {
    LoggerFactory.use({ level: LogLevels.DEBUG });
    expect(LoggerDebugGate.isOpen()).toBe(true);

    LoggerFactory.reset();
    expect(LoggerDebugGate.isOpen()).toBe(LoggerDebugGate.evaluate({ env: process.env }));
  });
});

describe('LoggerFactory.use - a level that is not a LogLevels value', () => {
  test('is ignored: it sets no threshold and never opens debug', () => {
    LoggerDebugGate.force({ isOpen: false });

    for (const level of ['WARN', 'trace', 'verbose', '']) {
      LoggerFactory.use({ level: level as TLogLevel });

      expect(LoggerFactory.currentLevel()).toBeUndefined();
      expect(LoggerDebugGate.isOpen()).toBe(false);
    }
  });

  test('a valid level after an invalid one still takes effect', () => {
    LoggerFactory.use({ level: 'trace' as TLogLevel });
    LoggerFactory.use({ level: LogLevels.WARN });

    expect(LoggerFactory.currentLevel()).toBe(LogLevels.WARN);
    expect(LoggerDebugGate.isOpen()).toBe(false);
  });
});

describe('LoggerFactory - the delegator gates debug for a provider that has no gate of its own', () => {
  test('with the gate closed, debug never reaches the provider; the other levels do', () => {
    LoggerDebugGate.force({ isOpen: false });
    LoggerFactory.use({ provider: RecordingProviderLogger });

    const logger = LoggerFactory.getLogger(['Gated']);
    logger.debug('hidden');
    logger.log(LogLevels.DEBUG, 'hidden too');
    logger.info('kept');

    expect(RecordingProviderLogger.writes.map((write) => write.message)).toEqual(['kept']);
  });
});
