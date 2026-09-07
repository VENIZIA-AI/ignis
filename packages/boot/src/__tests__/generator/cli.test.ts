import { checkArtifactIndex, generateArtifactIndex } from '@/generator';
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

describe('checkArtifactIndex - the header is not drift', () => {
  test('a file whose first line differs but whose body matches is fresh; a body change is stale', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ignis-artifacts-')), 'artifacts.ts');
    const generated = generateArtifactIndex({ root: FIXTURES, out });
    const [header, ...body] = generated.content.split('\n');

    writeFileSync(out, [`${header} --ignore legacy/**`, ...body].join('\n'));
    const headerOnly = checkArtifactIndex({ root: FIXTURES, out });
    expect(headerOnly.actual).not.toBe(headerOnly.expected);
    expect(headerOnly.isFresh).toBe(true);

    writeFileSync(
      out,
      [header, ...body.filter(line => !line.includes('GreeterService'))].join('\n'),
    );
    expect(checkArtifactIndex({ root: FIXTURES, out }).isFresh).toBe(false);

    rmSync(out, { force: true });
  });
});

describe('generate / check report the decorated classes a user --ignore hides', () => {
  const fixture = readFileSync(join(FIXTURES, 'services', 'greeter.service.ts'), 'utf8');

  const buildRoot = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-ignored-'));
    writeFileSync(join(root, 'kept.service.ts'), fixture.replace('GreeterService', 'KeptService'));
    mkdirSync(join(root, 'legacy'), { recursive: true });
    writeFileSync(
      join(root, 'legacy', 'old.service.ts'),
      fixture.replace('GreeterService', 'OldService'),
    );
    mkdirSync(join(root, '__tests__'), { recursive: true });
    writeFileSync(
      join(root, '__tests__', 'probe.service.ts'),
      fixture.replace('GreeterService', 'ProbeService'),
    );
    return root;
  };

  test('a user pattern hides OldService and the report names it; default patterns stay silent', () => {
    const root = buildRoot();
    const out = join(root, 'artifacts.ts');

    const generated = generateArtifactIndex({ root, out, ignore: ['legacy/**'] });
    expect(generated.artifacts.map(a => a.className)).toEqual(['KeptService']);
    expect(generated.ignored.map(a => a.className)).toEqual(['OldService']);
    expect(generated.ignored[0].filePath).toBe(join(root, 'legacy', 'old.service.ts'));

    const checked = checkArtifactIndex({ root, out, ignore: ['legacy/**'] });
    expect(checked.isFresh).toBe(true);
    expect(checked.ignored.map(a => a.className)).toEqual(['OldService']);

    rmSync(root, { recursive: true, force: true });
  });

  test('without a user pattern nothing is reported and OldService is indexed (positive control)', () => {
    const root = buildRoot();
    const out = join(root, 'artifacts.ts');

    const generated = generateArtifactIndex({ root, out });
    expect(generated.artifacts.map(a => a.className).sort()).toEqual(['KeptService', 'OldService']);
    expect(generated.ignored).toEqual([]);

    rmSync(root, { recursive: true, force: true });
  });
});

describe('a broken file under a user --ignore never fails the run', () => {
  test('two stereotypes on one hidden class: generate succeeds, the class is reported nowhere', () => {
    const root = mkdtempSync(join(tmpdir(), 'ignis-ignored-broken-'));
    const fixture = readFileSync(join(FIXTURES, 'services', 'greeter.service.ts'), 'utf8');
    writeFileSync(join(root, 'kept.service.ts'), fixture.replace('GreeterService', 'KeptService'));
    mkdirSync(join(root, 'legacy'), { recursive: true });
    writeFileSync(
      join(root, 'legacy', 'broken.ts'),
      [
        "import { service, controller } from '@venizia/ignis';",
        '',
        '@service()',
        '@controller()',
        'export class BrokenArtifact {}',
        '',
      ].join('\n'),
    );

    const out = join(root, 'artifacts.ts');
    const generated = generateArtifactIndex({ root, out, ignore: ['legacy/**'] });
    expect(generated.artifacts.map(a => a.className)).toEqual(['KeptService']);
    expect(generated.ignored).toEqual([]);

    expect(() => generateArtifactIndex({ root, out })).toThrow('carries 2 stereotypes');

    rmSync(root, { recursive: true, force: true });
  });
});
