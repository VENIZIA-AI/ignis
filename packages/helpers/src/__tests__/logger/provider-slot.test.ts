import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PACKAGE_ROOT } from '../package-root';
import { SpawnHelper } from '@venizia/dev-configs/testing';

/**
 * Prelude of every probe: a fake provider, a recorder over the console, and `loadTwoCopies()`, which loads the factory
 * module twice with every logger module evicted in between - the two copies a process holding the ESM and the CJS build
 * has, each with its own console provider and debug gate.
 */
const PRELUDE = `
const SLOT = Symbol.for('ignis:logger-provider');
const FACTORY = __FACTORY__;
const CORE = __CORE__;
const seen = [];
for (const method of ['debug', 'log', 'warn', 'error']) {
  console[method] = (line) => { seen.push(method + ':' + String(line)); };
}
const buildProvider = (name) => {
  const make = (scope) => {
    const record = (level) => (message) => { seen.push(name + ':' + scope + '|' + level + '|' + message); };
    return {
      debug: record('debug'), info: record('info'), warn: record('warn'), error: record('error'), emerg: record('emerg'),
      log: (level, message) => record('log:' + level)(message),
      for: (method) => make(scope + '-' + method),
    };
  };
  return { name, get: (scope) => make(scope) };
};
const fakeLogger = { debug() {}, info() {}, warn() {}, error() {}, emerg() {}, log() {}, for() { return fakeLogger; } };
const fakeProvider = { name: 'fake', get: () => fakeLogger };
const loadTwoCopies = () => {
  const first = require(FACTORY).LoggerFactory;
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/src/modules/logger/')) {
      delete require.cache[key];
    }
  }
  const second = require(FACTORY).LoggerFactory;
  if (first === second) {
    throw new Error('the probe did not load two copies');
  }
  return { first, second };
};
`;

/** Each case runs in a fresh process: the factory is module state, and the slot is process-global. */
const runInFreshProcess = async (opts: {
  name: string;
  body: string;
  env?: Record<string, string | undefined>;
}): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ignis-logger-slot-'));
  try {
    const script = path.join(directory, `${opts.name}.ts`);
    const factoryPath = path.resolve(PACKAGE_ROOT, 'src/modules/logger/factory.ts');
    const corePath = path.resolve(PACKAGE_ROOT, 'src/core.ts');
    await writeFile(
      script,
      PRELUDE.replace('__FACTORY__', JSON.stringify(factoryPath)).replace(
        '__CORE__',
        JSON.stringify(corePath),
      ) + opts.body,
    );
    const result = SpawnHelper.spawnSyncBounded({
      cmd: ['bun', script],
      cwd: PACKAGE_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, DEBUG: undefined, NODE_ENV: undefined, ...opts.env },
    });
    const line = result.stdout
      .toString()
      .split('\n')
      .find((text) => text.startsWith('RESULT:'));
    if (!line) {
      throw new Error(`[provider-slot] no result | stderr: ${result.stderr.toString()}`);
    }
    return line.slice('RESULT:'.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/** Writes the result line through the saved stdout: the probe replaced the console methods. */
const PRINT = `process.stdout.write('RESULT:' + JSON.stringify(result) + '\\n');\n`;

describe('LoggerFactory shares its provider across module copies', () => {
  test('a provider registered by another copy (the slot) is the current provider here', async () => {
    const result = await runInFreshProcess({
      name: 'reads-slot',
      body:
        `Reflect.set(globalThis, SLOT, fakeProvider);\n` +
        `const { LoggerFactory } = await import(FACTORY);\n` +
        `const result = LoggerFactory.currentProvider() === fakeProvider && LoggerFactory.isChosen();\n` +
        PRINT,
    });

    expect(JSON.parse(result)).toBe(true);
  });

  test('use() publishes the provider to the slot for the other copy', async () => {
    const result = await runInFreshProcess({
      name: 'writes-slot',
      body:
        `const { LoggerFactory } = await import(FACTORY);\n` +
        `LoggerFactory.use({ provider: fakeProvider });\n` +
        `const result = Reflect.get(globalThis, SLOT) === fakeProvider;\n` +
        PRINT,
    });

    expect(JSON.parse(result)).toBe(true);
  });

  test('a provider chosen by one copy is the provider of the other, and a new logger there writes through it', async () => {
    const result = await runInFreshProcess({
      name: 'two-copies-provider',
      body: `
        const { first, second } = loadTwoCopies();
        const chosen = buildProvider('chosen');
        first.use({ provider: chosen });
        second.getLogger(['Second']).info('through the slot');
        second.getLogger(['Second']).for('run').warn('child too');
        const result = {
          provider: second.currentProvider() === chosen,
          chosen: second.isChosen(),
          seen,
        };
        ${PRINT}`,
    });

    expect(JSON.parse(result)).toEqual({
      provider: true,
      chosen: true,
      seen: ['chosen:Second|info|through the slot', 'chosen:Second-run|warn|child too'],
    });
  });

  test('a level set by one copy is the level of the other, and filters its lines', async () => {
    const result = await runInFreshProcess({
      name: 'two-copies-level',
      body: `
        const { first, second } = loadTwoCopies();
        first.use({ provider: buildProvider('chosen'), level: 'warn' });
        const logger = second.getLogger(['Second']);
        logger.info('dropped');
        logger.log('info', 'dropped too');
        logger.warn('kept');
        logger.log('error', 'kept too');
        const result = { level: second.currentLevel(), seen };
        ${PRINT}`,
    });

    expect(JSON.parse(result)).toEqual({
      level: 'warn',
      seen: ['chosen:Second|warn|kept', 'chosen:Second|log:error|kept too'],
    });
  });

  test('reset() in one copy clears the provider and the level for the other', async () => {
    const result = await runInFreshProcess({
      name: 'two-copies-reset',
      body: `
        const { first, second } = loadTwoCopies();
        first.use({ provider: buildProvider('chosen'), level: 'error' });
        first.reset();
        second.getLogger(['Second']).info('to the console');
        const result = { chosen: second.isChosen(), level: second.currentLevel() ?? null, seen };
        ${PRINT}`,
    });

    expect(JSON.parse(result)).toEqual({
      chosen: false,
      level: null,
      seen: ['log:[Second] to the console'],
    });
  });

  // A wrapper of the other copy that already wrote a line takes the new provider on its next line: the wrapper compares
  // the shared generation counter, which every `use()` and `reset()` moves.
  test('a logger of the other copy that already wrote a line switches on its next line', async () => {
    const result = await runInFreshProcess({
      name: 'two-copies-repoint',
      body: `
        const { first, second } = loadTwoCopies();
        const early = second.getLogger(['Early']);
        early.info('before');
        first.use({ provider: buildProvider('chosen') });
        early.info('after');
        const result = seen;
        ${PRINT}`,
    });

    expect(JSON.parse(result)).toEqual(['log:[Early] before', 'chosen:Early|info|after']);
  });

  // The debug override `use({ level: 'debug' })` sets lives in a globalThis slot, so the other copy's console provider
  // writes debug too.
  test('a debug level set by one copy opens debug for the console provider of the other', async () => {
    const result = await runInFreshProcess({
      name: 'two-copies-debug',
      body: `
        const { first, second } = loadTwoCopies();
        first.use({ level: 'debug' });
        second.getLogger(['Second']).debug('shown');
        const result = seen;
        ${PRINT}`,
    });

    expect(JSON.parse(result)).toEqual(['debug:[Second] shown']);
  });
});

describe('LoggerFactory.use after loggers exist (one copy, a fresh process)', () => {
  test('loggers, a helper logger already read and for() children switch on their next line, and reset() returns to the console', async () => {
    const result = await runInFreshProcess({
      name: 'use-after-loggers',
      body: `
        const { BaseHelper, LoggerFactory } = await import(CORE);
        const direct = LoggerFactory.getLogger(['Direct']);
        const helper = new BaseHelper({ scope: 'Helper' });
        const helperLogger = helper.logger;
        const child = direct.for('x');
        const helperChild = helperLogger.for('y');
        const writeAll = (tag) => {
          direct.info(tag);
          helper.logger.warn(tag);
          child.error(tag);
          helperChild.emerg(tag);
        };
        writeAll('console');
        LoggerFactory.use({ provider: buildProvider('first') });
        writeAll('first');
        LoggerFactory.use({ provider: buildProvider('second') });
        writeAll('second');
        LoggerFactory.reset();
        writeAll('reset');
        const result = { sameHelperLogger: helper.logger === helperLogger, seen };
        ${PRINT}`,
    });

    expect(JSON.parse(result)).toEqual({
      sameHelperLogger: true,
      seen: [
        'log:[Direct] console',
        'warn:[Helper] console',
        'error:[Direct-x] console',
        'error:[Helper-y] console',
        'first:Direct|info|first',
        'first:Helper|warn|first',
        'first:Direct-x|error|first',
        'first:Helper-y|emerg|first',
        'second:Direct|info|second',
        'second:Helper|warn|second',
        'second:Direct-x|error|second',
        'second:Helper-y|emerg|second',
        'log:[Direct] reset',
        'warn:[Helper] reset',
        'error:[Direct-x] reset',
        'error:[Helper-y] reset',
      ],
    });
  });
});
