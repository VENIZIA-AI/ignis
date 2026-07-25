import { describe, expect, test } from 'bun:test';

/** Guards against winston loading eagerly via a barrel `export * from './winston'` or a static import in `factory.ts` - it must load lazily, only at the first unregistered log call. */
const winstonState = async (body: string): Promise<string> => {
  const probe = `
    ${body}
    const loaded = Object.keys(require.cache ?? {}).some(path => path.includes('/node_modules/winston/'));
    console.log(loaded ? 'WINSTON_LOADED' : 'WINSTON_ABSENT');
  `;

  const result = Bun.spawnSync({
    cmd: ['bun', '-e', probe],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (!stdout.includes('WINSTON_LOADED') && !stdout.includes('WINSTON_ABSENT')) {
    throw new Error(
      `[no-eager-winston-import] probe failed | stdout: ${stdout} | stderr: ${stderr}`,
    );
  }

  return stdout.includes('WINSTON_LOADED') ? 'WINSTON_LOADED' : 'WINSTON_ABSENT';
};

describe('single-provider loading - winston stays unloaded until it is the chosen one', () => {
  test('the root barrel loads zero winston modules', async () => {
    expect(await winstonState(`await import('./src/index.ts');`)).toBe('WINSTON_ABSENT');
  });

  test('the logger barrel loads zero winston modules', async () => {
    expect(await winstonState(`await import('./src/modules/logger/index.ts');`)).toBe(
      'WINSTON_ABSENT',
    );
  });

  test('creating loggers (factory + facades) still loads zero winston modules', async () => {
    const body = `
      const { LoggerFactory, ApplicationLogger } = await import('./src/index.ts');
      LoggerFactory.getLogger(['ProbeScope']);
      ApplicationLogger.get('ProbeScope').for('method');
    `;
    expect(await winstonState(body)).toBe('WINSTON_ABSENT');
  });

  test('an app on another provider logs WITHOUT ever loading winston', async () => {
    const body = `
      const { LoggerFactory, AbstractLogger } = await import('./src/index.ts');
      class SilentLogger extends AbstractLogger {
        static get() { return new SilentLogger(); }
        debug() {} info() {} warn() {} error() {} emerg() {} log() {}
        for() { return this; }
      }
      const early = LoggerFactory.getLogger(['CapturedBeforeUse']);
      LoggerFactory.use({ provider: SilentLogger });
      early.info('routed to the registered provider');
      LoggerFactory.getLogger(['CreatedAfterUse']).error('also routed');
    `;
    expect(await winstonState(body)).toBe('WINSTON_ABSENT');
  });

  test('the lazy default DOES load winston at the first unregistered log call (positive control)', async () => {
    const body = `
      const { LoggerFactory } = await import('./src/index.ts');
      LoggerFactory.getLogger(['DefaultProbe']).info('first line triggers the default');
    `;
    expect(await winstonState(body)).toBe('WINSTON_LOADED');
  });
});
