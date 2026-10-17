import './kernel-stub';
import { GroupArtifactsResolver, IgnisArtifactsPlugin } from '@/bun';
import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const CORE = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'groups', 'core');
const GROUPS_FILE = resolve(CORE, 'src', 'groups.ts');
const APP = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'auto', 'app');
const STUB = resolve(process.cwd(), 'src', '__tests__', 'bun', 'kernel-stub.ts');

describe('the application group', () => {
  test('a group without a folder resolves to every decorated class of the defining package', async () => {
    const index = await GroupArtifactsResolver.resolve({
      group: { folder: undefined, site: GROUPS_FILE },
    });
    const names = Object.values(index)
      .flat()
      .map(target => target.name)
      .sort();
    expect(names).toEqual([
      'CategoryService',
      'StockRepository',
      'StockService',
      'TwinService',
      'TwinService',
    ]);
  });

  test('a build inlines ArtifactGroup.application() with the package\x27s classes', () => {
    const output = IgnisArtifactsPlugin.rewriteGroups({
      filePath: GROUPS_FILE,
      source:
        "import { ArtifactGroup } from '@venizia/ignis-kernel';\nexport const Own = ArtifactGroup.application();\n",
    });
    expect(output).toMatch(
      /ArtifactGroup\.application\(\{ content: \{ repositories: \[__ignis_group_\d+\], services: \[/,
    );
    expect(() => new Bun.Transpiler({ loader: 'ts' }).transformSync(output)).not.toThrow();
  });
});

describe('the auto module\x27s root', () => {
  test('is the entry module\x27s package, whatever the working directory', () => {
    const run = Bun.spawnSync(['bun', '--preload', STUB, resolve(APP, 'src', 'entry.ts')], {
      cwd: tmpdir(),
    });
    expect(run.stdout.toString()).toContain('entry-root=AlphaService,BetaRepository');
  });

  test('a package without src is a clear error, not ENOENT', () => {
    expect(() =>
      IgnisArtifactsPlugin.render({ root: resolve(tmpdir(), 'no-such-package', 'src') }),
    ).toThrow(/has no src directory/);
  });
});
