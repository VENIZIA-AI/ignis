import { getError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { JoseLoader } from '@/components/auth/authenticate/services/jose-loader';

const PACKAGE_ROOT = join(__dirname, '../../..');

/**
 * Runs `body` in a fresh bun process, then reports whether any `jose` module is loaded. A fresh
 * process, because this one already loaded `jose` through other test files.
 */
const probeJose = (opts: { body: string }): string => {
  const probe = `
    ${opts.body}
    const isLoaded = Object.keys(require.cache ?? {}).some(path => path.includes('/jose/dist/'));
    console.log(isLoaded ? 'JOSE_LOADED' : 'JOSE_ABSENT');
  `;

  const result = Bun.spawnSync({
    cmd: ['bun', '-e', probe],
    cwd: PACKAGE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = result.stdout.toString();
  if (!stdout.includes('JOSE_LOADED') && !stdout.includes('JOSE_ABSENT')) {
    throw getError({
      message: `[jose-lazy-load] probe failed | stdout: ${stdout} | stderr: ${result.stderr.toString()}`,
    });
  }

  return stdout.includes('JOSE_LOADED') ? 'JOSE_LOADED' : 'JOSE_ABSENT';
};

// A `require('jose')` at load time races an application's own `import 'jose'` under Bun
// ("require() async module ... is unsupported"), so nothing may load it before first use.
describe('auth services load jose lazily', () => {
  test('importing the auth services loads no jose module', () => {
    const body = `await import('./src/components/auth/authenticate/services/index.ts');`;

    expect(probeJose({ body })).toBe('JOSE_ABSENT');
  });

  test('importing the package root loads no jose module', () => {
    const body = `await import('./src/index.ts');`;

    expect(probeJose({ body })).toBe('JOSE_ABSENT');
  });

  test('the first token operation loads jose (positive control)', () => {
    const body = `
      const { JWSTokenService } = await import('./src/components/auth/authenticate/services/index.ts');
      const service = new JWSTokenService({
        jwtSecret: 'probe-secret-that-is-long-enough-for-hs256',
        getTokenExpiresFn: () => 60,
      });
      const token = await service.generate({ payload: { userId: 'probe', roles: [] } });
      await service.verify({ type: 'Bearer', token });
    `;

    expect(probeJose({ body })).toBe('JOSE_LOADED');
  });

  test('every caller shares one load', () => {
    expect(JoseLoader.load()).toBe(JoseLoader.load());
  });
});
