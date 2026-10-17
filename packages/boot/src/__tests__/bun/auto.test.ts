import { AutoArtifactsLoader } from '@/bun';
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const APP = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'auto', 'app');
const STUB = resolve(process.cwd(), 'src', '__tests__', 'bun', 'kernel-stub.ts');
const AUTO = resolve(process.cwd(), 'src', 'bun', 'auto.ts');

describe('@venizia/ignis-boot/auto', () => {
  test('importing it from an application resolves to that application\x27s index', () => {
    const result = Bun.spawnSync(
      [
        'bun',
        '--preload',
        STUB,
        '-e',
        `const index = await (await import('${AUTO}')).default; console.log(JSON.stringify(Object.fromEntries(Object.entries(index).map(([k, v]) => [k, v.map(c => c.name)]))));`,
      ],
      { cwd: APP },
    );
    expect(result.exitCode).toBe(0);
    const index = JSON.parse(result.stdout.toString().trim().split('\n').at(-1) ?? '{}');
    expect(index.services).toEqual(['AlphaService']);
    expect(index.repositories).toEqual(['BetaRepository']);
  });

  test('without Bun it fails with the CLI fallback named', () => {
    expect(() => AutoArtifactsLoader.assertRuntime({ hasBun: false })).toThrow(
      /ignis-artifacts generate/,
    );
    expect(() => AutoArtifactsLoader.assertRuntime({ hasBun: true })).not.toThrow();
  });
});
