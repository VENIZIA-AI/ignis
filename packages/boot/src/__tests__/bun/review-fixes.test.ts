import './kernel-stub';
import { ArtifactSources, GroupArtifactsResolver, IgnisArtifactsPlugin } from '@/bun';
import { ArtifactScanner } from '@/generator';
import { describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CORE = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'groups', 'core');
const GROUPS_FILE = resolve(CORE, 'src', 'groups.ts');
const rewrite = (source: string) =>
  IgnisArtifactsPlugin.rewriteGroups({ filePath: GROUPS_FILE, source });

describe('rewriteGroups - layouts and refusals', () => {
  test('a multi-line define with a trailing comma stays valid TypeScript', () => {
    const output = rewrite(
      "import { ArtifactGroup } from '@venizia/ignis-kernel';\nexport const A = ArtifactGroup.define({\n  folder: 'commerce',\n});\n",
    );
    expect(output).not.toContain(',,');
    expect(() => new Bun.Transpiler({ loader: 'ts' }).transformSync(output)).not.toThrow();
  });

  test('a define that already carries content is left alone', () => {
    const source =
      "import { ArtifactGroup } from '@venizia/ignis-kernel';\nexport const A = ArtifactGroup.define({ folder: 'commerce', content: {} });\n";
    expect(rewrite(source)).toBe(source);
  });

  test('two classes with the same name in one group get distinct local bindings', () => {
    const output = rewrite(
      "import { ArtifactGroup } from '@venizia/ignis-kernel';\nexport const A = ArtifactGroup.define({ folder: 'duplicates' });\n",
    );
    const locals = [...output.matchAll(/import \{ TwinService as (\w+) \}/g)].map(
      match => match[1],
    );
    expect(locals).toHaveLength(2);
    expect(new Set(locals).size).toBe(2);
  });

  test('a define it cannot rewrite (aliased class, shorthand or computed folder) fails the build', () => {
    expect(() =>
      rewrite(
        "import { ArtifactGroup as G } from '@venizia/ignis-kernel';\nexport const A = G.define({ folder: 'commerce' });\n",
      ),
    ).toThrow(/cannot be rewritten/);
    expect(() =>
      rewrite(
        "import { ArtifactGroup } from '@venizia/ignis-kernel';\nconst folder = 'commerce';\nexport const A = ArtifactGroup.define({ folder });\n",
      ),
    ).toThrow(/cannot be rewritten/);
  });
});

describe('groupDefinitionFiles - workspace layouts', () => {
  test('finds a workspace dependency linked in a hoisted node_modules above the app, and the app\x27s own src', () => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-hoisted-'));
    mkdirSync(join(root, 'node_modules', '@fixture'), { recursive: true });
    symlinkSync(CORE, join(root, 'node_modules', '@fixture', 'core'));
    mkdirSync(join(root, 'apps', 'web', 'src'), { recursive: true });
    writeFileSync(
      join(root, 'apps', 'web', 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { '@fixture/core': '*' } }),
    );
    writeFileSync(
      join(root, 'apps', 'web', 'src', 'own-groups.ts'),
      "import { ArtifactGroup } from '@venizia/ignis-kernel';\nexport const Own = ArtifactGroup\n  .define({ folder: 'services' });\n",
    );

    const files = IgnisArtifactsPlugin.groupDefinitionFiles({
      root: join(root, 'apps', 'web', 'src'),
    });
    expect(files).toContain(GROUPS_FILE);
    expect(files.some(file => file.endsWith('own-groups.ts'))).toBe(true);
  });
});

describe('GroupArtifactsResolver - a compiled tree with no compiled classes', () => {
  test('a group defined in a dist copy never falls back to the src classes', async () => {
    expect(
      GroupArtifactsResolver.resolve({
        group: { folder: 'inventory', site: resolve(CORE, 'dist', 'esm', 'groups.js') },
      }),
    ).rejects.toThrow(/has no compiled copy/);
  });
});

describe('ArtifactSources - one scan per package', () => {
  test('two groups of one package scan it once', () => {
    ArtifactSources.clear();
    const scan = spyOn(ArtifactScanner.prototype, 'scanWithReport');
    ArtifactSources.folderArtifacts({ folder: 'inventory', site: GROUPS_FILE });
    ArtifactSources.folderArtifacts({ folder: 'commerce', site: GROUPS_FILE });
    expect(scan).toHaveBeenCalledTimes(1);
    scan.mockRestore();
  });
});
