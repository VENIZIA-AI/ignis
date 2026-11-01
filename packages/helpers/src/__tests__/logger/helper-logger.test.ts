import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import path from 'node:path';
import { BaseHelper } from '@/modules/base';
import { BaseLogger } from '@/modules/logger/base/base';
import { LogLevels, LoggerDebugGate } from '@/modules/logger/common';
import type { TLogLevel } from '@/modules/logger/common';
import type { ILogger, ILoggerProvider } from '@/modules/logger/common/types';
import { LoggerFactory } from '@/modules/logger/factory';
import { PACKAGE_ROOT } from '../package-root';
import { SpawnHelper } from '@venizia/dev-configs/testing';

class ProbeHelper extends BaseHelper {
  constructor() {
    super({ scope: 'Probe', identifier: 'one' });
  }
}

/** A provider that records `scope|level|message` for every line it is handed. */
const buildRecorder = (): { lines: Array<string>; provider: ILoggerProvider } => {
  const lines: Array<string> = [];

  const make = (scope: string): ILogger => {
    const record = (level: string) => (message: string) => {
      lines.push(`${scope}|${level}|${message}`);
    };
    return {
      debug: record('debug'),
      info: record('info'),
      warn: record('warn'),
      error: record('error'),
      emerg: record('emerg'),
      log: (level, message) => lines.push(`${scope}|log:${level}|${message}`),
      for: (methodName) => make(`${scope}-${methodName}`),
    };
  };

  return { lines, provider: { get: (scope) => make(scope) } };
};

describe('BaseHelper.logger', () => {
  const spies: Array<ReturnType<typeof spyOn>> = [];

  const silence = (method: 'log' | 'debug' | 'warn') => {
    spies.push(spyOn(console, method).mockImplementation(() => {}));
  };

  // The slots are process-global and other suites in the run may leave a provider chosen: start every case clean.
  beforeEach(() => {
    LoggerFactory.reset();
  });

  afterEach(() => {
    LoggerFactory.reset();
    for (const spy of spies.splice(0)) {
      spy.mockRestore();
    }
  });

  test('is the factory logger of the joined scope and identifier', () => {
    const helper = new ProbeHelper();
    expect(helper.logger).toBe(LoggerFactory.getLogger(['Probe', 'one']));
  });

  test('a logger read before any provider is chosen hands over once one is', () => {
    silence('log');
    const helper = new ProbeHelper();

    helper.logger.info('before');
    const child = helper.logger.for('method');

    const recorder = buildRecorder();
    LoggerFactory.use({ provider: recorder.provider });
    helper.logger.info('after');
    child.info('child after');

    expect(recorder.lines).toEqual(['Probe-one|info|after', 'Probe-one-method|info|child after']);
  });

  test('with no level set, an upgraded logger passes every line except debug while the gate is closed', () => {
    silence('debug');
    LoggerDebugGate.force({ isOpen: false });
    const helper = new ProbeHelper();
    const early = helper.logger;
    const child = early.for('method');

    const recorder = buildRecorder();
    LoggerFactory.use({ provider: recorder.provider });
    early.debug('direct');
    child.emerg('child');
    early.log(LogLevels.WARN, 'dynamic');

    expect(recorder.lines).toEqual(['Probe-one-method|emerg|child', 'Probe-one|log:warn|dynamic']);
  });

  test('with no level set and the gate open, debug reaches the provider too', () => {
    silence('debug');
    LoggerDebugGate.force({ isOpen: true });
    const early = new ProbeHelper().logger;

    const recorder = buildRecorder();
    LoggerFactory.use({ provider: recorder.provider });
    early.debug('direct');

    expect(recorder.lines).toEqual(['Probe-one|debug|direct']);
  });

  test('reading logger off a prototype neither throws nor pins it there', () => {
    LoggerFactory.use({ provider: buildRecorder().provider });

    expect(Reflect.get(ProbeHelper.prototype, 'logger')).toBeDefined();
    expect(Object.hasOwn(ProbeHelper.prototype, 'logger')).toBe(false);
    expect(Object.hasOwn(BaseHelper.prototype, 'logger')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(BaseHelper.prototype, 'logger')?.get).toBeDefined();
  });

  test('with a provider chosen first, a helper line goes straight to it', () => {
    const recorder = buildRecorder();
    LoggerFactory.use({ provider: recorder.provider });
    const helper = new ProbeHelper();

    helper.logger.for('run').warn('direct');

    expect(recorder.lines).toEqual(['Probe-one-run|warn|direct']);
  });

  test('every read answers the same logger object', () => {
    LoggerFactory.use({ provider: buildRecorder().provider });
    const helper = new ProbeHelper();

    expect(helper.logger).toBe(helper.logger);
    expect(helper.getLogger()).toBe(helper.logger);
  });

  test('an assigned logger wins, before and after the first read', () => {
    LoggerFactory.use({ provider: buildRecorder().provider });
    const early = new ProbeHelper();
    const late = new ProbeHelper();
    const assigned = buildRecorder();

    early.logger = assigned.provider.get('assigned');
    expect(late.logger).toBeDefined();
    late.logger = assigned.provider.get('assigned');
    early.logger.info('early');
    late.logger.info('late');

    expect(assigned.lines).toEqual(['assigned|info|early', 'assigned|info|late']);
  });

  test('an assigned logger does not follow a later use()', () => {
    const helper = new ProbeHelper();
    const assigned = buildRecorder();
    helper.logger = assigned.provider.get('assigned');

    const chosen = buildRecorder();
    LoggerFactory.use({ provider: chosen.provider });
    helper.logger.info('kept');

    expect(assigned.lines).toEqual(['assigned|info|kept']);
    expect(chosen.lines).toEqual([]);
  });

  test('the logger stays out of the keys a spread or JSON sees', () => {
    LoggerFactory.use({ provider: buildRecorder().provider });
    const helper = new ProbeHelper();
    expect(helper.logger).toBeDefined();

    expect(Object.keys(helper)).toEqual(['scope', 'identifier']);
  });
});

describe('BaseHelper.logger with no provider chosen in the whole import graph', () => {
  // A fresh process: a helper-only graph (a script, a connectors-only service) never loads more than base.ts.
  test('writes to the console, with no warning however many helpers log', () => {
    const baseSource = path.resolve(PACKAGE_ROOT, 'src/modules/base.ts');
    const script = `
      const warnings = [];
      const lines = [];
      console.warn = (line) => warnings.push(String(line));
      const write = console.log.bind(console);
      console.log = (line) => lines.push(String(line));
      const { BaseHelper } = await import('${baseSource}');
      for (let index = 0; index < 3; index++) {
        const helper = new BaseHelper({ scope: 'Script' + index });
        helper.logger.info('one');
        helper.logger.for('method').info('two');
      }
      write(JSON.stringify({ warnings: warnings.length, lines }));
    `;
    const run = SpawnHelper.spawnSyncBounded({
      cmd: [process.execPath, '-e', script],
      stderr: 'pipe',
    });
    const report: { warnings: number; lines: Array<string> } = JSON.parse(
      run.stdout.toString().trim().split('\n').at(-1) ?? '{}',
    );

    expect(report.warnings).toBe(0);
    expect(report.lines).toEqual([
      '[Script0] one',
      '[Script0-method] two',
      '[Script1] one',
      '[Script1-method] two',
      '[Script2] one',
      '[Script2-method] two',
    ]);
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

  afterEach(() => {
    LoggerDebugGate.force({ isOpen: undefined });
  });

  const runBoth = () => {
    const viaMethod = new RecordingLogger({ scope: 'Probe' });
    const viaLog = new RecordingLogger({ scope: 'Probe' });

    viaMethod.debug('line');
    viaLog.log(LogLevels.DEBUG, 'line');
    viaLog.log(LogLevels.INFO, 'kept');

    return { viaMethod, viaLog };
  };

  test('a debug line through log() passes the same DEBUG gate as debug()', () => {
    const { viaMethod, viaLog } = runBoth();

    expect(viaLog.lines).toEqual([...viaMethod.lines, 'info|kept']);
    expect(viaMethod.lines).toEqual(LoggerDebugGate.isOpen() ? ['debug|line'] : []);
  });

  test('an open gate lets debug through both paths, a closed one stops both', () => {
    LoggerDebugGate.force({ isOpen: true });
    const open = runBoth();
    LoggerDebugGate.force({ isOpen: false });
    const closed = runBoth();

    expect(open.viaMethod.lines).toEqual(['debug|line']);
    expect(open.viaLog.lines).toEqual(['debug|line', 'info|kept']);
    expect(closed.viaMethod.lines).toEqual([]);
    expect(closed.viaLog.lines).toEqual(['info|kept']);
  });
});
