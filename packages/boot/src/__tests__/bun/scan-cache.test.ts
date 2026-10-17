import './kernel-stub';
import { ArtifactScanCache, ArtifactSources } from '@/bun';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FIXTURES = resolve(process.cwd(), 'src', '__tests__', 'fixtures');
const STUB = resolve(process.cwd(), 'src', '__tests__', 'bun', 'kernel-stub.ts');
const AUTO = resolve(process.cwd(), 'src', 'bun', 'auto.ts');

let workspace = '';
let app = '';

const copyApp = (name: string): string => {
  const root = join(workspace, name);
  cpSync(join(FIXTURES, 'auto', 'app'), root, {
    recursive: true,
    filter: path => !path.includes('app_data'),
  });
  return root;
};

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ignis-scan-cache-'));
  app = copyApp('app');
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
  ArtifactSources.clear();
});

describe('ArtifactScanCache', () => {
  const artifacts = [
    { className: 'AlphaService', filePath: '/x/alpha.service.ts', type: 'service' as const },
  ];

  test('a written scan reads back while no source file changed', () => {
    const root = join(copyApp('hit'), 'src');
    expect(ArtifactScanCache.write({ root, artifacts })).toBe(true);
    expect(ArtifactScanCache.read({ root })).toEqual(artifacts);
  });

  test('an edited source file is a miss', () => {
    const root = join(copyApp('edit'), 'src');
    ArtifactScanCache.write({ root, artifacts });
    appendFileSync(join(root, 'services', 'alpha.service.ts'), '\n// edited\n');
    expect(ArtifactScanCache.read({ root })).toBeUndefined();
  });

  test('an added source file is a miss', () => {
    const root = join(copyApp('add'), 'src');
    ArtifactScanCache.write({ root, artifacts });
    writeFileSync(join(root, 'services', 'delta.service.ts'), 'export const delta = 1;\n');
    expect(ArtifactScanCache.read({ root })).toBeUndefined();
  });

  test('a corrupt cache file is a miss, not an error', () => {
    const root = join(copyApp('corrupt'), 'src');
    ArtifactScanCache.write({ root, artifacts });
    writeFileSync(ArtifactScanCache.location({ root }), '{ not json');
    expect(ArtifactScanCache.read({ root })).toBeUndefined();
  });
});

describe('a source start with a warm cache', () => {
  test('registers the same classes and never loads TypeScript', () => {
    const probe = join(app, 'src', 'probe.ts');
    writeFileSync(
      probe,
      `import auto from ${JSON.stringify(AUTO)};\nconst index = await auto.resolve();\nconst names = Object.values(index).flat().map(target => target.name).sort().join(',');\nconst typescript = Object.keys(require.cache).some(key => /[\\\\/]typescript[\\\\/]lib[\\\\/]/.test(key));\nconsole.log('names=' + names + ' typescript=' + typescript);\n`,
    );
    const run = () => {
      const result = Bun.spawnSync(['bun', '--preload', STUB, probe], { cwd: tmpdir() });
      return result.stdout.toString() + result.stderr.toString();
    };
    expect(run()).toContain('names=AlphaService,BetaRepository typescript=true');
    expect(run()).toContain('names=AlphaService,BetaRepository typescript=false');
  });
});
