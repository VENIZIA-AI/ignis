import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { spawnSyncBounded } from './spawn.helper';

/**
 * A bundler may evaluate a split chunk holding decorated code before the `reflect-metadata` module
 * (vitejs/vite#21866), so a module that calls `Reflect.*Metadata` imports it itself. The probe runs
 * in its own process: here the global is already patched by the other tests.
 */
describe('decorators work without the caller importing reflect-metadata', () => {
  test('a module that reaches the registry directly records an @inject', () => {
    const run = spawnSyncBounded({
      cmd: [
        'bun',
        path.join(process.cwd(), 'src/__tests__/fixtures/decorators-without-reflect-metadata.ts'),
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(run.stderr.toString()).toBe('');
    expect(run.stdout.toString()).toBe('values.dependency');
    expect(run.success).toBe(true);
  });
});
