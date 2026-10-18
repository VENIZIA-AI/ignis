import { IgnisArtifactsVitePlugin } from '@/vite';
import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'tsx', 'app');
const GROUPS = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'groups', 'core');
const AUTO = resolve(process.cwd(), 'src', 'bun', 'auto.ts');

const plugin = (opts: { root?: string; viteRoot: string }) => {
  const created = IgnisArtifactsVitePlugin.create({ root: opts.root });
  created.configResolved({ root: opts.viteRoot });
  return created;
};

describe('IgnisArtifactsVitePlugin', () => {
  test('keeps ignis-boot out of pre-bundling and leaves the minifier alone', () => {
    const config = IgnisArtifactsVitePlugin.create().config();
    expect(config.optimizeDeps.exclude).toContain('@venizia/ignis-boot');
    expect(Object.keys(config)).toEqual(['optimizeDeps']);
  });

  test('pins the name of a scanned class only, inside the class so it runs before its decorators', () => {
    const file = resolve(APP, 'src', 'controllers', 'list.controller.ts');
    const source =
      "@controller({ path: '/list' })\nexport class ListController {}\nclass Helper {}\n";
    const output = plugin({ viteRoot: APP }).transform(source, file) ?? '';
    expect(output).toContain(
      'export class ListController { static { Object.defineProperty(this, \'name\', { value: "ListController" }); }}',
    );
    expect(output).toContain('class Helper {}');
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

describe('IgnisArtifactsVitePlugin and a shared package', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'ignis-vite-'));
  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test('pins the names of the classes an app borrows from a workspace dependency through a group', () => {
    cpSync(
      join(process.cwd(), 'src', '__tests__', 'fixtures', 'compile', 'app'),
      join(workspace, 'app'),
      {
        recursive: true,
      },
    );
    cpSync(GROUPS, join(workspace, 'core'), { recursive: true });
    mkdirSync(join(workspace, 'app', 'node_modules', '@fixture'), { recursive: true });
    symlinkSync(
      join(workspace, 'core'),
      join(workspace, 'app', 'node_modules', '@fixture', 'core'),
    );

    const file = join(workspace, 'core', 'src', 'services', 'inventory', 'stock.service.ts');
    const source =
      "import { service } from '@venizia/ignis-kernel';\n\n@service()\nexport class StockService {}\n";
    const output = plugin({ viteRoot: join(workspace, 'app') }).transform(source, file) ?? '';
    expect(output).toContain(`Object.defineProperty(this, 'name', { value: "StockService" })`);
  });
});
