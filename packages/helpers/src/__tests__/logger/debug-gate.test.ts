import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { LoggerDebugGate } from '@/modules/logger/common/debug-gate';
import { ParseUtility } from '@/utilities/parse.utility';
import { PACKAGE_ROOT } from '../package-root';
import { SpawnHelper } from '@venizia/dev-configs/testing';

type TEnvironment = Record<string, string | undefined>;

describe('LoggerDebugGate.evaluate - the rule, a pure function of env', () => {
  const cases: Array<{ name: string; env: TEnvironment; isOpen: boolean }> = [
    { name: 'DEBUG unset', env: {}, isOpen: false },
    { name: "DEBUG 'true'", env: { DEBUG: 'true' }, isOpen: true },
    { name: "DEBUG '1'", env: { DEBUG: '1' }, isOpen: true },
    { name: "DEBUG 'false'", env: { DEBUG: 'false' }, isOpen: false },
    { name: "DEBUG '0'", env: { DEBUG: '0' }, isOpen: false },
    { name: "DEBUG ''", env: { DEBUG: '' }, isOpen: false },
    // The string 'undefined' is not one of the falsy spellings: truthy, as `ParseUtility.toBoolean` has it.
    { name: "DEBUG 'undefined' (the string)", env: { DEBUG: 'undefined' }, isOpen: true },
    { name: 'NODE_ENV unset', env: { DEBUG: 'true', NODE_ENV: undefined }, isOpen: true },
    { name: "NODE_ENV ''", env: { DEBUG: 'true', NODE_ENV: '' }, isOpen: true },
    { name: 'NODE_ENV development', env: { DEBUG: 'true', NODE_ENV: 'development' }, isOpen: true },
    { name: 'NODE_ENV local', env: { DEBUG: 'true', NODE_ENV: 'local' }, isOpen: true },
    { name: 'NODE_ENV staging', env: { DEBUG: 'true', NODE_ENV: 'staging' }, isOpen: true },
    { name: 'NODE_ENV production', env: { DEBUG: 'true', NODE_ENV: 'production' }, isOpen: true },
    {
      name: 'NODE_ENV test (not allowed)',
      env: { DEBUG: 'true', NODE_ENV: 'test' },
      isOpen: false,
    },
    { name: 'NODE_ENV qa (not allowed)', env: { DEBUG: 'true', NODE_ENV: 'qa' }, isOpen: false },
    {
      name: 'APP_ENV_EXTRA_LOG_ENVS adds qa',
      env: { DEBUG: 'true', NODE_ENV: 'qa', APP_ENV_EXTRA_LOG_ENVS: 'qa' },
      isOpen: true,
    },
    {
      name: 'APP_ENV_EXTRA_LOG_ENVS is a trimmed comma list',
      env: { DEBUG: 'true', NODE_ENV: 'test', APP_ENV_EXTRA_LOG_ENVS: ' qa , test ' },
      isOpen: true,
    },
    {
      name: 'APP_ENV_EXTRA_LOG_ENVS naming another environment does not allow this one',
      env: { DEBUG: 'true', NODE_ENV: 'test', APP_ENV_EXTRA_LOG_ENVS: 'qa' },
      isOpen: false,
    },
    {
      name: 'an allowed environment does not open a falsy DEBUG',
      env: { DEBUG: 'false', NODE_ENV: 'development' },
      isOpen: false,
    },
    {
      name: 'an extra environment does not open an unset DEBUG',
      env: { NODE_ENV: 'qa', APP_ENV_EXTRA_LOG_ENVS: 'qa' },
      isOpen: false,
    },
  ];

  for (const { name, env, isOpen } of cases) {
    test(`${name} -> ${isOpen ? 'open' : 'closed'}`, () => {
      expect(LoggerDebugGate.evaluate({ env })).toBe(isOpen);
    });
  }

  test('readEnvironment() is the host environment when there is a process', () => {
    expect(LoggerDebugGate.readEnvironment()).toBe(process.env);
  });
});

describe('LoggerDebugGate - DEBUG truthiness matches ParseUtility.toBoolean', () => {
  // The gate repeats the truthiness on purpose (ParseUtility's error module must stay out of BaseHelper's bundle).
  // This table is what stops the two copies drifting.
  const values: Array<string | undefined> = [
    undefined,
    '',
    'false',
    '0',
    'true',
    '1',
    'yes',
    'no',
    'FALSE',
    'False',
    'TRUE',
    ' ',
    ' 0',
    '0 ',
    'false ',
    '00',
    'off',
    'null',
    'undefined',
  ];

  for (const value of values) {
    test(`DEBUG ${JSON.stringify(value) ?? 'undefined'}`, () => {
      expect(LoggerDebugGate.evaluate({ env: { DEBUG: value } })).toBe(
        ParseUtility.toBoolean({ input: value }),
      );
    });
  }
});

/**
 * A fresh process per case: the gate reads the host environment once and keeps it. The probe replaces the console
 * methods, can remove `globalThis.process` (a browser) around its body, and prints one `RESULT:` line.
 */
const runGateProbe = (opts: {
  body: string;
  env?: TEnvironment;
  withoutProcess?: boolean;
}): { isOpen: unknown; lines: Array<string>; [key: string]: unknown } => {
  const source = (relative: string) => JSON.stringify(path.resolve(PACKAGE_ROOT, relative));
  const script = `
    const lines = [];
    for (const method of ['debug', 'log', 'warn', 'error']) {
      console[method] = (line) => { lines.push(method + ':' + String(line)); };
    }
    const { BaseHelper, ConsoleLogger, LoggerFactory, LogLevels } = await import(${source('src/core.ts')});
    const { LoggerDebugGate } = await import(${source('src/modules/logger/common/debug-gate.ts')});
    const result = { lines };
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
    const write = process.stdout.write.bind(process.stdout);
    if (${opts.withoutProcess === true}) {
      Reflect.deleteProperty(globalThis, 'process');
      result.processGone = globalThis.process === undefined;
    }
    try {
      ${opts.body}
    } finally {
      if (globalThis.process === undefined) {
        Object.defineProperty(globalThis, 'process', descriptor);
      }
    }
    write('RESULT:' + JSON.stringify(result) + '\\n');
  `;

  const run = SpawnHelper.spawnSyncBounded({
    cmd: [process.execPath, '-e', script],
    cwd: PACKAGE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      DEBUG: undefined,
      NODE_ENV: undefined,
      APP_ENV_EXTRA_LOG_ENVS: undefined,
      ...opts.env,
    },
  });
  const line = run.stdout
    .toString()
    .split('\n')
    .find((text) => text.startsWith('RESULT:'));

  if (!line) {
    throw new Error(`[debug-gate] no result | stderr: ${run.stderr.toString()}`);
  }

  return JSON.parse(line.slice('RESULT:'.length));
};

const WRITE_DEBUG = `
  result.isOpen = LoggerDebugGate.isOpen();
  ConsoleLogger.get('Direct').debug('direct');
  LoggerFactory.getLogger(['Factory']).debug('factory');
  new BaseHelper({ scope: 'Helper' }).logger.debug('helper');
`;

const ALL_DEBUG_LINES = [
  'debug:[Direct] direct',
  'debug:[Factory] factory',
  'debug:[Helper] helper',
];

describe('LoggerDebugGate.isOpen - the host environment (a fresh process each)', () => {
  test('DEBUG=true in an allowed environment: open, and the console writes debug', () => {
    const result = runGateProbe({
      env: { DEBUG: 'true', NODE_ENV: 'development' },
      body: WRITE_DEBUG,
    });

    expect(result.isOpen).toBe(true);
    expect(result.lines).toEqual(ALL_DEBUG_LINES);
  });

  test('DEBUG unset: closed, and the console writes no debug', () => {
    const result = runGateProbe({ body: WRITE_DEBUG });

    expect(result.isOpen).toBe(false);
    expect(result.lines).toEqual([]);
  });

  test('DEBUG=true in an environment not allowed: closed', () => {
    const result = runGateProbe({ env: { DEBUG: 'true', NODE_ENV: 'test' }, body: WRITE_DEBUG });

    expect(result.isOpen).toBe(false);
    expect(result.lines).toEqual([]);
  });

  test('DEBUG=true in an environment APP_ENV_EXTRA_LOG_ENVS adds: open', () => {
    const result = runGateProbe({
      env: { DEBUG: 'true', NODE_ENV: 'test', APP_ENV_EXTRA_LOG_ENVS: 'test' },
      body: WRITE_DEBUG,
    });

    expect(result.isOpen).toBe(true);
    expect(result.lines).toEqual(ALL_DEBUG_LINES);
  });

  test('no globalThis.process (a browser): closed even with DEBUG=true in the environment', () => {
    const result = runGateProbe({
      env: { DEBUG: 'true', NODE_ENV: 'development' },
      withoutProcess: true,
      body: `
        result.environment = LoggerDebugGate.readEnvironment();
        ${WRITE_DEBUG}
      `,
    });

    expect(result.processGone).toBe(true);
    expect(result.environment).toEqual({});
    expect(result.isOpen).toBe(false);
    expect(result.lines).toEqual([]);
  });
});

describe('LoggerDebugGate - LoggerFactory.use({ level }) overrides the environment (a fresh process each)', () => {
  test('level debug turns debug ON with no DEBUG in the environment', () => {
    const result = runGateProbe({
      body: `
        LoggerFactory.use({ level: LogLevels.DEBUG });
        ${WRITE_DEBUG}
      `,
    });

    expect(result.isOpen).toBe(true);
    expect(result.lines).toEqual(ALL_DEBUG_LINES);
  });

  test('level debug turns debug ON with no process (a browser)', () => {
    const result = runGateProbe({
      withoutProcess: true,
      body: `
        LoggerFactory.use({ level: LogLevels.DEBUG });
        ${WRITE_DEBUG}
      `,
    });

    expect(result.processGone).toBe(true);
    expect(result.isOpen).toBe(true);
    expect(result.lines).toEqual(ALL_DEBUG_LINES);
  });

  test('level info turns debug OFF even when DEBUG is set, for the provider too', () => {
    const result = runGateProbe({
      env: { DEBUG: 'true', NODE_ENV: 'development' },
      body: `
        result.before = LoggerDebugGate.isOpen();
        LoggerFactory.use({ level: LogLevels.INFO });
        ${WRITE_DEBUG}
      `,
    });

    expect(result.before).toBe(true);
    expect(result.isOpen).toBe(false);
    // `ConsoleLogger.get(...)` is the provider itself, behind no wrapper: its own gate is what closed.
    expect(result.lines).toEqual([]);
  });

  test('every level above debug turns debug OFF', () => {
    const result = runGateProbe({
      env: { DEBUG: 'true', NODE_ENV: 'development' },
      body: `
        result.isOpen = null;
        result.byLevel = {};
        for (const level of [LogLevels.INFO, LogLevels.WARN, LogLevels.ERROR, LogLevels.EMERG]) {
          LoggerFactory.use({ level });
          result.byLevel[level] = LoggerDebugGate.isOpen();
        }
      `,
    });

    expect(result.byLevel).toEqual({ info: false, warn: false, error: false, emerg: false });
  });

  test('reset() clears the override: back to the environment', () => {
    const result = runGateProbe({
      env: { DEBUG: 'true', NODE_ENV: 'development' },
      body: `
        LoggerFactory.use({ level: LogLevels.INFO });
        result.forced = LoggerDebugGate.isOpen();
        LoggerFactory.reset();
        ${WRITE_DEBUG}
      `,
    });

    expect(result.forced).toBe(false);
    expect(result.isOpen).toBe(true);
    expect(result.lines).toEqual(ALL_DEBUG_LINES);
  });

  test('reset() after level debug closes debug again when the environment has no DEBUG', () => {
    const result = runGateProbe({
      body: `
        LoggerFactory.use({ level: LogLevels.DEBUG });
        result.forced = LoggerDebugGate.isOpen();
        LoggerFactory.reset();
        ${WRITE_DEBUG}
      `,
    });

    expect(result.forced).toBe(true);
    expect(result.isOpen).toBe(false);
    expect(result.lines).toEqual([]);
  });
});
