import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtlasSymbols, SYMBOLS_OUTPUT } from '../atlas-symbols';

const tmpDirs: string[] = [];

const makeTmpDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'ignis-atlas-symbols-'));
  tmpDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('AtlasSymbols.sourcePathOf', () => {
  test('maps a dist/cjs declaration back to its source file', () => {
    expect(
      AtlasSymbols.sourcePathOf({ distPath: 'packages/helpers/dist/cjs/modules/base.d.ts' }),
    ).toBe('packages/helpers/src/modules/base.ts');
  });

  test('maps a dist/esm declaration back to the same source file', () => {
    expect(
      AtlasSymbols.sourcePathOf({ distPath: 'packages/helpers/dist/esm/modules/base.d.ts' }),
    ).toBe('packages/helpers/src/modules/base.ts');
  });

  test('maps a flat dist declaration back to its source file', () => {
    expect(AtlasSymbols.sourcePathOf({ distPath: 'packages/core-server/dist/index.d.ts' })).toBe(
      'packages/core-server/src/index.ts',
    );
  });

  test('leaves a path with no dist segment alone', () => {
    expect(AtlasSymbols.sourcePathOf({ distPath: 'node_modules/zod/index.d.ts' })).toBeUndefined();
  });
});

describe('AtlasSymbols.collapseSignature', () => {
  test('collapses a multi-line declaration onto one line', () => {
    const collapsed = AtlasSymbols.collapseSignature({
      text: 'getError(opts: {\n  message: string;\n}): ApplicationError',
    });

    expect(collapsed).toBe('getError(opts: { message: string; }): ApplicationError');
  });

  test('strips the export and declare modifiers and the trailing semicolon', () => {
    expect(AtlasSymbols.collapseSignature({ text: 'export declare const answer: number;' })).toBe(
      'const answer: number',
    );
  });

  test('caps the signature at 300 characters', () => {
    const collapsed = AtlasSymbols.collapseSignature({ text: 'x'.repeat(500) });

    expect(collapsed.length).toBe(300);
  });
});

const hasGeneratedTable = existsSync(SYMBOLS_OUTPUT);

// Reading every package's .d.ts takes tens of seconds; the drift case below renders one small
// package instead, so only the freshness test pays for the whole surface.
const WHOLE_SURFACE_TIMEOUT_MS = 300_000;
const ONE_PACKAGE_TIMEOUT_MS = 60_000;

describe.skipIf(!hasGeneratedTable)('AtlasSymbols.check', () => {
  test(
    'reads fresh against the committed table',
    () => {
      // The table is read from dist, so a rebuild since the last `gen` reads stale here too.
      expect(AtlasSymbols.check(), 'stale symbol table - run `make symbols-gen`').toBe(true);
    },
    WHOLE_SURFACE_TIMEOUT_MS,
  );

  test(
    'reads stale once a symbol is dropped from the table',
    () => {
      const packages = ['atlas'];
      const outputPath = join(makeTmpDir(), 'symbols.json');
      writeFileSync(outputPath, AtlasSymbols.render({ packages }));
      expect(AtlasSymbols.check({ packages, outputPath })).toBe(true);

      const table = JSON.parse(readFileSync(outputPath, 'utf8'));
      table.symbols = table.symbols.slice(1);
      writeFileSync(outputPath, `${JSON.stringify(table, null, 2)}\n`);

      expect(AtlasSymbols.check({ packages, outputPath })).toBe(false);
    },
    ONE_PACKAGE_TIMEOUT_MS,
  );
});
