import { describe, expect, test } from 'bun:test';

/** `pino` is an optional peer behind the `/pino` sub-path - nothing reachable from the root or logger barrel may value-import it; a barrel re-export would still compile here but break consumers without pino installed. */
const loadsPino = async (specifier: string): Promise<boolean> => {
  const probe = `
    const before = new Set(Object.keys(require.cache ?? {}));
    await import(${JSON.stringify(specifier)});
    const loaded = Object.keys(require.cache ?? {}).some(path => path.includes('/node_modules/pino/'));
    console.log(loaded ? 'PINO_LOADED' : 'PINO_ABSENT');
  `;

  const result = Bun.spawnSync({
    cmd: ['bun', '-e', probe],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (!stdout.includes('PINO_LOADED') && !stdout.includes('PINO_ABSENT')) {
    throw new Error(`[no-eager-pino-import] probe failed | stdout: ${stdout} | stderr: ${stderr}`);
  }

  return stdout.includes('PINO_LOADED');
};

describe('pino stays an optional peer - no eager import from the barrels', () => {
  test('the root barrel loads zero pino modules', async () => {
    expect(await loadsPino('./src/index.ts')).toBe(false);
  });

  test('the logger barrel loads zero pino modules', async () => {
    expect(await loadsPino('./src/modules/logger/index.ts')).toBe(false);
  });

  test('a literal pino import DOES load pino - the spy is live (positive control)', async () => {
    expect(await loadsPino('pino')).toBe(true);
  });
});
