import { afterEach, describe, expect, test } from 'bun:test';
import winston from 'winston';
import { resolveLoggerColorize } from '@/modules/logger';
import { defineCustomLogger } from '@/modules/logger/winston';

const MESSAGE = Symbol.for('message');
const LEVEL = Symbol.for('level');
const ANSI_ESCAPE = '[';

/** Every test saves and restores what it touches, so suite order never matters. */
const ENV_KEYS = ['APP_ENV_LOGGER_COLOR', 'NO_COLOR', 'NODE_ENV'] as const;

const saved: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  saved[key] = process.env[key];
}

const restoreEnv = () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = saved[key];
  }
};

const clearEnv = () => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
};

/** Renders one info object exactly as winston would through the console transport. */
const renderConsoleLine = (logger: winston.Logger): string => {
  const transport = logger.transports.find(el => el instanceof winston.transports.Console);
  expect(transport).toBeDefined();

  const seed = {
    level: 'info',
    message: 'hello',
    [LEVEL]: 'info',
  } as unknown as winston.Logform.TransformableInfo;

  const loggerFormat = logger.format;
  const prepped = loggerFormat ? loggerFormat.transform(seed, loggerFormat.options) : seed;
  if (typeof prepped === 'boolean') {
    throw new Error('logger format filtered the info');
  }

  const transportFormat = transport!.format;
  const finalized = transportFormat
    ? transportFormat.transform({ ...prepped }, transportFormat.options)
    : prepped;
  if (typeof finalized === 'boolean') {
    throw new Error('transport format filtered the info');
  }

  return String((finalized as { [MESSAGE]?: unknown })[MESSAGE] ?? finalized.message);
};

describe('resolveLoggerColorize - environment policy', () => {
  afterEach(restoreEnv);

  test('a development NODE_ENV leaves the decision open', () => {
    clearEnv();
    process.env.NODE_ENV = 'development';

    expect(resolveLoggerColorize()).toBeUndefined();
  });

  test('an unset NODE_ENV is development, so the decision stays open', () => {
    clearEnv();

    expect(resolveLoggerColorize()).toBeUndefined();
  });

  test('production turns color off', () => {
    clearEnv();
    process.env.NODE_ENV = 'production';

    expect(resolveLoggerColorize()).toBe(false);
  });

  // Fail-closed, the same boundary the error sanitizer draws: only our own engineers read a
  // development terminal. Every other environment ships its lines to a file or an aggregator.
  test.each(['staging', 'uat', 'alpha', 'beta', 'test', 'whatever'])(
    'NODE_ENV "%s" turns color off',
    environment => {
      clearEnv();
      process.env.NODE_ENV = environment;

      expect(resolveLoggerColorize()).toBe(false);
    },
  );

  test('NO_COLOR turns color off inside a development environment', () => {
    clearEnv();
    process.env.NODE_ENV = 'development';
    process.env.NO_COLOR = '1';

    expect(resolveLoggerColorize()).toBe(false);
  });

  test('an empty NO_COLOR is not set at all', () => {
    clearEnv();
    process.env.NODE_ENV = 'development';
    process.env.NO_COLOR = '';

    expect(resolveLoggerColorize()).toBeUndefined();
  });

  test('APP_ENV_LOGGER_COLOR=true beats production and NO_COLOR', () => {
    clearEnv();
    process.env.NODE_ENV = 'production';
    process.env.NO_COLOR = '1';
    process.env.APP_ENV_LOGGER_COLOR = 'true';

    expect(resolveLoggerColorize()).toBe(true);
  });

  test('APP_ENV_LOGGER_COLOR=false beats a development environment', () => {
    clearEnv();
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV_LOGGER_COLOR = 'false';

    expect(resolveLoggerColorize()).toBe(false);
  });

  test('an explicit argument beats every environment variable', () => {
    clearEnv();
    process.env.NODE_ENV = 'production';

    expect(resolveLoggerColorize({ environment: 'development' })).toBeUndefined();
    expect(resolveLoggerColorize({ configured: '0', environment: 'development' })).toBe(false);
  });
});

describe('defineCustomLogger - color follows the environment', () => {
  afterEach(restoreEnv);

  const buildConsoleOnlyLogger = (extra?: { colorize?: boolean }) =>
    defineCustomLogger({ format: 'text', ...extra, transports: { info: {}, error: {} } });

  test('production: the console line carries no ANSI codes', () => {
    clearEnv();
    process.env.NODE_ENV = 'production';

    const rendered = renderConsoleLine(buildConsoleOnlyLogger());

    expect(rendered).toContain('hello');
    expect(rendered).not.toContain(ANSI_ESCAPE);
  });

  test('development: the console line is colorized', () => {
    clearEnv();
    process.env.NODE_ENV = 'development';

    const rendered = renderConsoleLine(buildConsoleOnlyLogger());

    expect(rendered).toContain(ANSI_ESCAPE);
  });

  test('an explicit colorize option overrides the environment, both ways', () => {
    clearEnv();
    process.env.NODE_ENV = 'production';
    expect(renderConsoleLine(buildConsoleOnlyLogger({ colorize: true }))).toContain(ANSI_ESCAPE);

    process.env.NODE_ENV = 'development';
    expect(renderConsoleLine(buildConsoleOnlyLogger({ colorize: false }))).not.toContain(
      ANSI_ESCAPE,
    );
  });
});
