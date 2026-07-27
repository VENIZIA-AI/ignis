import { afterEach, describe, expect, test } from 'bun:test';
import { AnyType } from '@/common/types';
import {
  AbstractLogger,
  ApplicationLogger,
  ILogger,
  ILoggerProvider,
  LoggerFactory,
  TLogLevel,
} from '@/modules/logger';
import { WinstonLogger } from '@/modules/logger/winston';

/** Minimal recording provider - what PinoLogger will be, shaped for assertions. */
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
    return RecordingProviderLogger.get(`${this['scope']}-${methodName}`);
  }
}

describe('LoggerFactory - swap-on-use provider registration', () => {
  afterEach(() => {
    LoggerFactory.use({ provider: WinstonLogger }); // restore the default for other suites
    RecordingProviderLogger.writes.length = 0;
  });

  test('default provider is WinstonLogger, resolved LAZILY on the first log call', () => {
    const wrapper = LoggerFactory.getLogger(['SwapDefault']) as AnyType;
    // No delegate yet - construction must not load a provider (single-provider guarantee).
    expect(wrapper['_delegate']).toBeUndefined();
    wrapper.debug('resolve now');
    expect(LoggerFactory.currentProvider()).toBe(WinstonLogger);
    expect(wrapper['_delegate']).toBe(WinstonLogger.get('SwapDefault'));
  });

  test('RecordingProviderLogger satisfies the ILoggerProvider contract LoggerFactory.use() accepts', () => {
    const provider: ILoggerProvider = RecordingProviderLogger;
    LoggerFactory.use({ provider });
    expect(LoggerFactory.currentProvider()).toBe(provider);
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

  test('use() is idempotent, re-callable, and eagerly re-points EXISTING wrappers', () => {
    const wrapper = LoggerFactory.getLogger(['SwapBack']) as AnyType;
    LoggerFactory.use({ provider: RecordingProviderLogger });
    LoggerFactory.use({ provider: RecordingProviderLogger });
    LoggerFactory.use({ provider: WinstonLogger });
    expect(wrapper['_delegate']).toBe(WinstonLogger.get('SwapBack'));
  });

  test('getLogger identity is stable per scope across calls', () => {
    expect(LoggerFactory.getLogger(['SwapIdentity'])).toBe(
      LoggerFactory.getLogger(['SwapIdentity']),
    );
  });
});

describe('ApplicationLogger - the provider-following facade', () => {
  afterEach(() => {
    LoggerFactory.use({ provider: WinstonLogger });
    RecordingProviderLogger.writes.length = 0;
  });

  test('get() routes through the factory and follows use()', () => {
    const logger: ILogger = ApplicationLogger.get('FacadeTest');
    LoggerFactory.use({ provider: RecordingProviderLogger });
    logger.warn('via facade');
    expect(RecordingProviderLogger.writes).toContainEqual({
      scope: 'FacadeTest',
      level: 'warn',
      message: 'via facade',
    });
  });

  test('facade and factory hand out the same wrapper per scope', () => {
    expect(ApplicationLogger.get('FacadeIdentity')).toBe(
      LoggerFactory.getLogger(['FacadeIdentity']),
    );
  });
});
