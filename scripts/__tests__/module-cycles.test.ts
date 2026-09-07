import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModuleGraph } from '../module-cycles';

const tmpDirs: string[] = [];

const makeFixture = (opts: { files: Record<string, string> }): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ignis-module-cycles-'));
  tmpDirs.push(dir);
  for (const [name, content] of Object.entries(opts.files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ModuleGraph.cycles', () => {
  test('reports a two-file cycle by relative path in a three-file graph', () => {
    const dir = makeFixture({
      files: {
        'a.js': "import './b.js';\nexport const a = 1;\n",
        'b.js': "import './a.js';\nexport const b = 1;\n",
        'c.js': "import './a.js';\nexport const c = 1;\n",
      },
    });

    const cycles = ModuleGraph.fromDirectory({ dir }).cycles();

    expect(cycles).toEqual([['a.js', 'b.js']]);
  });

  test('reports zero cycles once the back-edge is removed', () => {
    const dir = makeFixture({
      files: {
        'a.js': "import './b.js';\nexport const a = 1;\n",
        'b.js': 'export const b = 1;\n',
        'c.js': "import './a.js';\nexport const c = 1;\n",
      },
    });

    const cycles = ModuleGraph.fromDirectory({ dir }).cycles();

    expect(cycles).toEqual([]);
  });

  test('treats an export-star re-export as a graph edge', () => {
    const dir = makeFixture({
      files: {
        'p.js': "export * from './q.js';\n",
        'q.js': "import './p.js';\nexport const q = 1;\n",
      },
    });

    const cycles = ModuleGraph.fromDirectory({ dir }).cycles();

    expect(cycles).toEqual([['p.js', 'q.js']]);
  });

  test('does not treat a commented-out import line as an edge', () => {
    const dir = makeFixture({
      files: {
        'p2.js': "// import './q2.js';\nexport const p2 = 1;\n",
        'q2.js': "import './p2.js';\nexport const q2 = 1;\n",
      },
    });

    const cycles = ModuleGraph.fromDirectory({ dir }).cycles();

    expect(cycles).toEqual([]);
  });
});
