import { checkArtifactIndex, generateArtifactIndex } from '@/generator';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FIXTURES = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'artifacts');

describe('generateArtifactIndex / checkArtifactIndex', () => {
  test('generate writes the index; check is fresh right after; check is stale after a hand edit', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ignis-artifacts-')), 'artifacts.ts');

    const generated = generateArtifactIndex({ root: FIXTURES, out });
    expect(generated.written).toBe(true);
    expect(readFileSync(out, 'utf8')).toBe(generated.content);
    expect(generated.artifacts.map(a => a.className)).toContain('GreeterService');
    expect(generated.content).not.toContain('ProbeModel');

    expect(generateArtifactIndex({ root: FIXTURES, out }).written).toBe(false);
    expect(checkArtifactIndex({ root: FIXTURES, out }).isFresh).toBe(true);

    writeFileSync(out, `${generated.content}\n// drift`);
    const stale = checkArtifactIndex({ root: FIXTURES, out });
    expect(stale.isFresh).toBe(false);
    expect(stale.actual).not.toBe(stale.expected);

    rmSync(out, { force: true });
  });

  test('check on a missing file reports stale with actual undefined', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ignis-artifacts-')), 'missing.ts');

    const result = checkArtifactIndex({ root: FIXTURES, out });

    expect(result.isFresh).toBe(false);
    expect(result.actual).toBeUndefined();
  });
});
