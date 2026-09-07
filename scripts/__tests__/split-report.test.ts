import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SplitReport } from '../split-report';

const tmpDirs: string[] = [];

const makeFixture = (opts: { files: Record<string, string> }): string => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-split-report-'));
  tmpDirs.push(root);
  for (const [relPath, content] of Object.entries(opts.files)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
};

const typesFile = (opts: { count: number }): string => {
  const lines = Array.from(
    { length: opts.count },
    (_, index) => `export type T${index + 1} = string;`,
  );
  return `${lines.join('\n')}\n`;
};

// Captures SplitReport.run's console.log lines instead of parsing a spawned process's stdout -
// it is exported and directly callable, so this is the report's programmatic API.
const runReport = (opts: { packageDir: string }): string[] => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (message: string) => lines.push(message);
  try {
    SplitReport.run({ packageDir: opts.packageDir });
  } finally {
    console.log = original;
  }
  return lines;
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('SplitReport.run', () => {
  let dirty: string[];
  let clean: string[];

  beforeAll(() => {
    const dirtyRoot = makeFixture({
      files: {
        'src/common/index.ts': 'export const marker = true;\n',
        'src/common/types.ts': typesFile({ count: 11 }),
        'src/service.ts': 'export class Foo {}\nexport class Bar {}\n',
        'src/foo/index.ts': 'export const marker = true;\n',
        'src/foo/types.ts': 'export type Only = string;\n',
        'src/bar/thing.ts': 'export const thing = 1;\n',
      },
    });
    dirty = runReport({ packageDir: dirtyRoot });

    const cleanRoot = makeFixture({
      files: {
        'src/common/index.ts': 'export const marker = true;\n',
        'src/common/types.ts': typesFile({ count: 10 }),
        'src/service.ts': 'export class Solo {}\n',
      },
    });
    clean = runReport({ packageDir: cleanRoot });
  });

  test('lists a common/types.ts file with more than 10 exports as a hub candidate', () => {
    expect(dirty).toContain('- hub candidates (> 10 exports): 1');
    expect(dirty).toContain('    src/common/types.ts (11)');
  });

  test('lists a file with two exported classes', () => {
    expect(dirty).toContain('- files with 2+ exported classes: 1');
    expect(dirty).toContain('    src/service.ts (Foo, Bar)');
  });

  test('lists a types.ts file outside common/ as stray', () => {
    expect(dirty).toContain('- types/constants outside common/: 1');
    expect(dirty).toContain('    src/foo/types.ts');
  });

  test('lists a scope folder missing an index.ts as without a barrel', () => {
    expect(dirty).toContain('- scope folders without index.ts: 1');
    expect(dirty).toContain('    src/bar');
  });

  test('reports all four counts as zero for the clean counterpart', () => {
    expect(clean).toContain('- hub candidates (> 10 exports): 0');
    expect(clean).toContain('- files with 2+ exported classes: 0');
    expect(clean).toContain('- types/constants outside common/: 0');
    expect(clean).toContain('- scope folders without index.ts: 0');
  });
});
