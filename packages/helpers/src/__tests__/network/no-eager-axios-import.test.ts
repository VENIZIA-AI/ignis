import { describe, expect, test } from 'bun:test';

/** axios is an OPTIONAL peer - nothing reachable from the root or network barrel may value-import it (AxiosFetcher/AxiosNetworkRequest live behind the `@venizia/ignis-helpers/axios` sub-path); a stray `export * from './axios-fetcher'` reintroduces the eager import silently. */
const loadsAxios = async (specifier: string): Promise<boolean> => {
  const probe = `
    const before = new Set(Object.keys(require.cache ?? {}));
    await import(${JSON.stringify(specifier)});
    const loaded = Object.keys(require.cache ?? {}).some(path => path.includes('/node_modules/axios/'));
    console.log(loaded ? 'AXIOS_LOADED' : 'AXIOS_ABSENT');
  `;

  const result = Bun.spawnSync({
    cmd: ['bun', '-e', probe],
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (!stdout.includes('AXIOS_LOADED') && !stdout.includes('AXIOS_ABSENT')) {
    throw new Error(`[no-eager-axios-import] probe failed | stdout: ${stdout} | stderr: ${stderr}`);
  }

  return stdout.includes('AXIOS_LOADED');
};

describe('axios stays an optional peer - no eager import from the barrels', () => {
  test('the network barrel loads zero axios modules', async () => {
    expect(await loadsAxios('./src/modules/network/index.ts')).toBe(false);
  });

  test('the http-request barrel loads zero axios modules', async () => {
    expect(await loadsAxios('./src/modules/network/http-request/index.ts')).toBe(false);
  });

  test('the fetcher barrel loads zero axios modules', async () => {
    expect(await loadsAxios('./src/modules/network/http-request/fetcher/index.ts')).toBe(false);
  });

  test('the axios sub-path DOES load axios - the escape hatch works', async () => {
    expect(await loadsAxios('./src/modules/network/http-request/fetcher/axios-fetcher.ts')).toBe(
      true,
    );
  });
});
