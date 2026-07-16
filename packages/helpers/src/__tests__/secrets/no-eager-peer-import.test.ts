import { describe, expect, test } from 'bun:test';

/**
 * node-vault and @dotenvx/dotenvx are OPTIONAL peers. Importing the secrets barrel - or the whole
 * package - must load NEITHER. HashiCorpVaultHelper/DotenvVaultHelper live behind the
 * `@venizia/ignis-helpers/vault` and `/dotenv-vault` sub-paths; the factory reaches them via
 * dynamic import only. A barrel `export * from './hashicorp'` would silently reintroduce the eager
 * import. This suite fails first if that happens.
 */
const loadsPeer = async (specifier: string, peerPathFragment: string): Promise<boolean> => {
  const probe = `
    await import(${JSON.stringify(specifier)});
    const loaded = Object.keys(require.cache ?? {}).some(p => p.includes(${JSON.stringify(peerPathFragment)}));
    console.log(loaded ? 'PEER_LOADED' : 'PEER_ABSENT');
  `;
  const result = Bun.spawnSync({
    cmd: ['bun', '-e', probe],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = result.stdout.toString();
  if (!stdout.includes('PEER_LOADED') && !stdout.includes('PEER_ABSENT')) {
    throw new Error(
      `[no-eager-peer-import] probe failed | stdout: ${stdout} | stderr: ${result.stderr.toString()}`,
    );
  }
  return stdout.includes('PEER_LOADED');
};

describe('secrets barrel keeps peers optional', () => {
  test('secrets barrel loads zero node-vault modules', async () => {
    expect(await loadsPeer('./src/modules/secrets/index.ts', '/node_modules/node-vault/')).toBe(
      false,
    );
  });
  test('secrets barrel loads zero dotenvx modules', async () => {
    expect(await loadsPeer('./src/modules/secrets/index.ts', '/node_modules/@dotenvx/')).toBe(
      false,
    );
  });
});
