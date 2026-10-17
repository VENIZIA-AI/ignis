import './kernel-stub';
import { ArtifactSources, GroupArtifactsResolver, IgnisArtifactsPlugin } from '@/bun';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const FIXTURES = resolve(process.cwd(), 'src', '__tests__', 'fixtures');
const STUB = resolve(process.cwd(), 'src', '__tests__', 'bun', 'kernel-stub.ts');
const AUTO = resolve(process.cwd(), 'src', 'bun', 'auto.ts');

/** A package as tsc leaves it: `src` beside a CommonJS `dist`. */
const buildPackage = (opts: { fixture: string; into: string }): string => {
  const root = join(opts.into, opts.fixture.split('/').pop() ?? 'package');
  cpSync(join(FIXTURES, opts.fixture), root, {
    recursive: true,
    filter: path => !path.includes('dist') && !path.includes('app_data'),
  });
  for (const relativePath of new Bun.Glob('**/*.ts').scanSync({ cwd: join(root, 'src') })) {
    const output = ts.transpileModule(
      require('node:fs').readFileSync(join(root, 'src', relativePath), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
        },
      },
    ).outputText;
    const target = join(root, 'dist', relativePath.replace(/\.ts$/, '.js'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output);
  }
  return root;
};

let workspace = '';
let core = '';
let app = '';

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'ignis-running-tree-'));
  core = buildPackage({ fixture: 'groups/core', into: workspace });
  app = buildPackage({ fixture: 'auto/app', into: workspace });
  ArtifactSources.clear();
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
  ArtifactSources.clear();
});

describe('a group defined in a compiled tree', () => {
  test('lists its classes from src and loads each from the compiled tree', () => {
    const artifacts = ArtifactSources.folderArtifacts({
      folder: 'inventory',
      site: join(core, 'dist', 'groups.js'),
    });
    expect(artifacts.map(artifact => artifact.filePath).sort()).toEqual([
      join(core, 'dist', 'repositories', 'inventory', 'stock.repository.js'),
      join(core, 'dist', 'services', 'inventory', 'stock.service.js'),
    ]);
  });

  test('registers the very class the compiled code exports', async () => {
    const index = await GroupArtifactsResolver.resolve({
      group: { folder: 'inventory', site: join(core, 'dist', 'groups.js') },
    });
    const running = await import(join(core, 'dist', 'services', 'inventory', 'stock.service.js'));
    expect(index.services?.[0]).toBe(running.StockService);
  });

  test('a stale build (a class with no compiled copy) is an error naming the rebuild', () => {
    const stale = buildPackage({ fixture: 'groups/core', into: join(workspace, 'stale') });
    rmSync(join(stale, 'dist', 'repositories', 'inventory', 'stock.repository.js'));
    expect(() =>
      ArtifactSources.folderArtifacts({
        folder: 'inventory',
        site: join(stale, 'dist', 'groups.js'),
      }),
    ).toThrow(/has no compiled copy.*rebuild/i);
  });
});

describe('auto artifacts from a compiled entry', () => {
  test('the rendered index imports the compiled classes', () => {
    const source = IgnisArtifactsPlugin.render({
      root: join(app, 'src'),
      entry: join(app, 'dist', 'entry.js'),
    });
    expect(source).toContain(`${join(app, 'dist', 'services', 'alpha.service.js')}`);
    expect(source).not.toContain(".ts'");
  });

  test('a process started from the compiled entry registers the classes its code runs', () => {
    writeFileSync(
      join(app, 'dist', 'probe.js'),
      `const auto = require(${JSON.stringify(AUTO)}).default;\nconst { AlphaService } = require('./services/alpha.service.js');\nauto.resolve().then(index => console.log('same=' + (index.services[0] === AlphaService)));\n`,
    );
    const run = Bun.spawnSync(['bun', '--preload', STUB, join(app, 'dist', 'probe.js')], {
      cwd: tmpdir(),
    });
    expect(run.stdout.toString() + run.stderr.toString()).toContain('same=true');
  });
});

describe('a build of compiled CommonJS', () => {
  test('inlines a namespaced ArtifactGroup.define with the compiled classes', () => {
    const filePath = join(core, 'dist', 'groups.js');
    const output = IgnisArtifactsPlugin.rewriteGroups({
      filePath,
      source:
        'const ignis_kernel_1 = require("@venizia/ignis-kernel");\nexports.Inventory = ignis_kernel_1.ArtifactGroup.define({ folder: \'inventory\' });\n',
    });
    expect(output).toContain(
      `require(${JSON.stringify(join(core, 'dist', 'services', 'inventory', 'stock.service.js'))}).StockService`,
    );
    expect(() => new Bun.Transpiler({ loader: 'js' }).transformSync(output)).not.toThrow();
  });

  test('finds group definitions in a workspace package\x27s compiled tree', () => {
    const files = IgnisArtifactsPlugin.groupDefinitionFiles({ root: join(core, 'src') });
    expect(files).toContain(join(core, 'dist', 'groups.js'));
  });
});
