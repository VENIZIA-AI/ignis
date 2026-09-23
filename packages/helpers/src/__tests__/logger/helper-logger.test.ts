import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { BaseHelper } from '@/modules/base';
import { BaseLogger } from '@/modules/logger/base/base';
import { LogLevels, SHOULD_LOG_DEBUG } from '@/modules/logger/common';
import type { TLogLevel } from '@/modules/logger/common';
import type { ILogger } from '@/modules/logger/common/types';
import { loggerSlot } from '@/modules/logger/slot';
import type { TLoggerResolver } from '@/modules/logger/slot';
import { PACKAGE_ROOT } from '../package-root';

class ProbeHelper extends BaseHelper {
  constructor() {
    super({ scope: 'Probe', identifier: 'one' });
  }
}

/** A resolver that records `scope|level|message` for every line it is handed. */
const buildRecorder = (): { lines: Array<string>; resolve: TLoggerResolver } => {
  const lines: Array<string> = [];

  const make = (opts: { scopes: Array<string> }): ILogger => {
    const tag = opts.scopes.join('-');
    const record = (level: string) => (message: string) => {
      lines.push(`${tag}|${level}|${message}`);
    };
    return {
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
      emerg: record('emerg'),
      log: (level, message) => lines.push(`${tag}|log:${level}|${message}`),
      for: methodName => make({ scopes: [...opts.scopes, methodName] }),
    };
  };

  return { lines, resolve: opts => make({ scopes: opts.scopes }) };
};

describe('BaseHelper.logger', () => {
  let installed: TLoggerResolver | undefined;

  beforeEach(() => {
    installed = loggerSlot.resolve;
    loggerSlot.resolve = undefined;
  });

  afterEach(() => {
    loggerSlot.resolve = installed;
    spyOn(console, 'info').mockRestore();
    spyOn(console, 'warn').mockRestore();
  });

  test('a logger read before any resolver exists hands over once one is installed', () => {
    spyOn(console, 'info').mockImplementation(() => {});
    spyOn(console, 'warn').mockImplementation(() => {});
    const helper = new ProbeHelper();

    helper.logger.info('before');
    const child = helper.logger.for('method');

    const recorder = buildRecorder();
    loggerSlot.resolve = recorder.resolve;
    helper.logger.info('after');
    child.info('child after');

    expect(recorder.lines).toEqual(['Probe-one|info|after', 'Probe-one-method|info|child after']);
  });

  test('an upgraded logger calls the level method, so the provider gates debug itself', () => {
    spyOn(console, 'debug').mockImplementation(() => {});
    spyOn(console, 'warn').mockImplementation(() => {});
    const helper = new ProbeHelper();
    const early = helper.logger;
    const child = early.for('method');

    const recorder = buildRecorder();
    loggerSlot.resolve = recorder.resolve;
    early.debug('direct');
    child.emerg('child');
    early.log(LogLevels.WARN, 'dynamic');

    expect(recorder.lines).toEqual([
      'Probe-one|debug|direct',
      'Probe-one-method|emerg|child',
      'Probe-one|warn|dynamic',
    ]);
    spyOn(console, 'debug').mockRestore();
  });

  test('reading logger off a prototype neither throws nor pins it there', () => {
    loggerSlot.resolve = buildRecorder().resolve;

    expect(Reflect.get(ProbeHelper.prototype, 'logger')).toBeDefined();
    expect(Object.hasOwn(ProbeHelper.prototype, 'logger')).toBe(false);
    expect(Object.hasOwn(BaseHelper.prototype, 'logger')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(BaseHelper.prototype, 'logger')?.get).toBeDefined();
  });

  test('with a resolver installed, the helper gets the real logger directly', () => {
    const recorder = buildRecorder();
    loggerSlot.resolve = recorder.resolve;
    const helper = new ProbeHelper();

    helper.logger.for('run').warn('direct');

    expect(recorder.lines).toEqual(['Probe-one-run|warn|direct']);
  });

  test('every read answers the same logger object', () => {
    loggerSlot.resolve = buildRecorder().resolve;
    const helper = new ProbeHelper();

    expect(helper.logger).toBe(helper.logger);
    expect(helper.getLogger()).toBe(helper.logger);
  });

  test('an assigned logger wins, before and after the first read', () => {
    loggerSlot.resolve = buildRecorder().resolve;
    const early = new ProbeHelper();
    const late = new ProbeHelper();
    const assigned = buildRecorder();

    early.logger = assigned.resolve({ scopes: ['assigned'] });
    expect(late.logger).toBeDefined();
    late.logger = assigned.resolve({ scopes: ['assigned'] });
    early.logger.info('early');
    late.logger.info('late');

    expect(assigned.lines).toEqual(['assigned|info|early', 'assigned|info|late']);
  });

  test('the logger stays out of the keys a spread or JSON sees', () => {
    loggerSlot.resolve = buildRecorder().resolve;
    const helper = new ProbeHelper();
    expect(helper.logger).toBeDefined();

    expect(Object.keys(helper)).toEqual(['scope', 'identifier']);
  });
});

describe('BaseHelper.logger with no resolver in the whole import graph', () => {
  // A fresh process: the "already warned" state belongs to the process, and a helper-only graph
  // (a script, a connectors-only service) never loads the resolver module.
  test('warns once that it is logging to the console, however many helpers log', () => {
    const baseSource = path.resolve(PACKAGE_ROOT, 'src/modules/base.ts');
    const script = `
      const warnings = [];
      console.warn = (line) => warnings.push(String(line));
      console.info = () => {};
      const { BaseHelper } = await import('${baseSource}');
      for (let index = 0; index < 3; index++) {
        const helper = new BaseHelper({ scope: 'Script' + index });
        helper.logger.info('one');
        helper.logger.for('method').info('two');
      }
      console.log(JSON.stringify({ warnings: warnings.filter(line => line.includes('no logger provider')).length }));
    `;
    const run = Bun.spawnSync({ cmd: [process.execPath, '-e', script], stderr: 'pipe' });
    const report: { warnings: number } = JSON.parse(
      run.stdout.toString().trim().split('\n').at(-1) ?? '{}',
    );

    expect(report.warnings).toBe(1);
  });

  /** Runs a script that logs once through each import, and counts the provider warnings. */
  const countWarnings = (opts: { prelude?: string; modules: Array<string> }): number => {
    const script = `
      const warnings = [];
      console.warn = (line) => warnings.push(String(line));
      console.info = () => {};
      ${opts.prelude ?? ''}
      for (const source of ${JSON.stringify(opts.modules)}) {
        const { resolveHelperLogger } = await import(source);
        resolveHelperLogger({ scopes: ['Copy'] }).info('one');
      }
      console.log(JSON.stringify({ warnings: warnings.filter(line => line.includes('no logger provider')).length }));
    `;
    const run = Bun.spawnSync({ cmd: [process.execPath, '-e', script], stderr: 'pipe' });
    const report: { warnings?: number } = JSON.parse(
      run.stdout.toString().trim().split('\n').at(-1) ?? '{}',
    );
    return report.warnings ?? -1;
  };

  const SLOT_SOURCE = path.resolve(PACKAGE_ROOT, 'src/modules/logger/slot.ts');

  test('two copies of the module in one process still warn once', async () => {
    // A second file is a second module instance - what a process holding the CJS and ESM builds has.
    const copy = path.resolve(PACKAGE_ROOT, 'src/modules/logger/.slot-copy-probe.ts');
    await Bun.write(copy, await Bun.file(SLOT_SOURCE).text());
    try {
      expect(countWarnings({ modules: [SLOT_SOURCE, copy] })).toBe(1);
    } finally {
      await rm(copy, { force: true });
    }
  });

  test('a browser gets no advice to import a barrel it cannot load', () => {
    const prelude = "Object.defineProperty(process.versions, 'node', { value: undefined });";
    expect(countWarnings({ prelude, modules: [SLOT_SOURCE] })).toBe(0);
  });
});

describe('BaseLogger.log', () => {
  class RecordingLogger extends BaseLogger {
    readonly lines: Array<string> = [];

    protected write(opts: { level: TLogLevel; message: string }): void {
      this.lines.push(`${opts.level}|${opts.message}`);
    }

    protected child(): RecordingLogger {
      return this;
    }
  }

  test('a debug line through log() passes the same DEBUG gate as debug()', () => {
    const viaMethod = new RecordingLogger({ scope: 'Probe' });
    const viaLog = new RecordingLogger({ scope: 'Probe' });

    viaMethod.debug('line');
    viaLog.log(LogLevels.DEBUG, 'line');
    viaLog.log(LogLevels.INFO, 'kept');

    expect(viaLog.lines).toEqual([...viaMethod.lines, 'info|kept']);
    expect(viaMethod.lines).toEqual(SHOULD_LOG_DEBUG ? ['debug|line'] : []);
  });
});
