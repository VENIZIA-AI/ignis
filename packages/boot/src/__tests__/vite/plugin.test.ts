import { IgnisArtifactsVitePlugin } from '@/vite';
import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

const APP = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'tsx', 'app');
const GROUPS = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'groups', 'core');
const AUTO = resolve(process.cwd(), 'src', 'bun', 'auto.ts');

const plugin = (opts: { root?: string; viteRoot: string }) => {
  const created = IgnisArtifactsVitePlugin.create({ root: opts.root });
  created.configResolved({ root: opts.viteRoot });
  return created;
};

describe('IgnisArtifactsVitePlugin', () => {
  test('keeps class names in the build and keeps ignis-boot out of pre-bundling', () => {
    const config = IgnisArtifactsVitePlugin.create().config();
    expect(config.build.rolldownOptions.output.keepNames).toBe(true);
    expect(config.optimizeDeps.exclude).toContain('@venizia/ignis-boot');
  });

  test('serves ignis:artifacts with the classes of the src beside the root package.json', () => {
    const created = plugin({ viteRoot: APP });
    const id = created.resolveId('ignis:artifacts');
    expect(id).toBe(IgnisArtifactsVitePlugin.RESOLVED_VIRTUAL);
    const index = created.load(id ?? '') ?? '';
    expect(index).toContain('controllers: [ListController, ViewController]');
    expect(created.resolveId('./other')).toBeUndefined();
  });

  test('replaces the auto module with an eager import of the index', () => {
    const autoModule = plugin({ viteRoot: APP }).load(AUTO) ?? '';
    expect(autoModule).toContain("from 'ignis:artifacts'");
    expect(autoModule).toContain('new AutoArtifactGroup({ content: GeneratedArtifacts })');
  });

  test('inlines the classes of an ArtifactGroup call in a group definition file', () => {
    const file = resolve(GROUPS, 'src', 'groups.ts');
    const output =
      plugin({ viteRoot: GROUPS }).transform(
        "import { ArtifactGroup } from '@venizia/ignis-kernel';\nexport const Own = ArtifactGroup.application();\n",
        file,
      ) ?? '';
    expect(output).toMatch(
      /ArtifactGroup\.application\(\{ content: \{ repositories: \[__ignis_group_\d+\]/,
    );
    expect(
      plugin({ viteRoot: GROUPS }).transform(
        'export const x = 1;',
        resolve(GROUPS, 'src', 'other.ts'),
      ),
    ).toBeUndefined();
  });
});
