import { describe, expect, test } from 'bun:test';
import { PACKAGE_ROOT } from '../package-root';
import { SpawnHelper } from '@venizia/dev-configs/testing';

/** Guards against winston loading eagerly via a barrel `export * from './winston'` or a static import in `factory.ts` - the default provider is the console, so winston loads only when an application chooses it. */
const winstonState = async (body: string): Promise<string> => {
  const probe = `
    ${body}
    const loaded = Object.keys(require.cache ?? {}).some(path => path.includes('/node_modules/winston/'));
    console.log(loaded ? 'WINSTON_LOADED' : 'WINSTON_ABSENT');
  `;

  const result = SpawnHelper.spawnSyncBounded({
    cmd: ['bun', '-e', probe],
    cwd: PACKAGE_ROOT,
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
    const result = await winstonState(`await import('./src/index.ts');`);
    expect(result).toBe('WINSTON_ABSENT');
  });

  test('the logger barrel loads zero winston modules', async () => {
    const result = await winstonState(`await import('./src/modules/logger/index.ts');`);
    expect(result).toBe('WINSTON_ABSENT');
  });

  test('creating loggers and their children still loads zero winston modules', async () => {
    const body = `
      const { LoggerFactory } = await import('./src/index.ts');
      LoggerFactory.getLogger(['ProbeScope']);
      LoggerFactory.getLogger(['ProbeScope']).for('method');
    `;
    const result = await winstonState(body);
    expect(result).toBe('WINSTON_ABSENT');
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
    const result = await winstonState(body);
    expect(result).toBe('WINSTON_ABSENT');
  });

  test('a line through the default provider (the console) loads zero winston modules', async () => {
    const body = `
      const { LoggerFactory } = await import('./src/index.ts');
      LoggerFactory.getLogger(['DefaultProbe']).info('first line goes to the console');
      LoggerFactory.getLogger(['DefaultProbe']).for('method').error('and so does a child');
    `;
    const result = await winstonState(body);
    expect(result).toBe('WINSTON_ABSENT');
  });

  test('an app that chooses winston DOES load it (positive control: the probe sees winston)', async () => {
    const body = `
      const { LoggerFactory } = await import('./src/index.ts');
      const { WinstonLogger } = await import('./src/modules/logger/winston/index.ts');
      LoggerFactory.use({ provider: WinstonLogger });
      LoggerFactory.getLogger(['WinstonProbe']).info('routed to winston');
    `;
    const result = await winstonState(body);
    expect(result).toBe('WINSTON_LOADED');
  });
});
