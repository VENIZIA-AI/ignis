import { AutoArtifactsLoader } from '@/bun/auto-loader';
import { ArtifactStereotypes } from '@/generator/common';
import { ArtifactIndexEmitter } from '@/generator/emitter';
import { ArtifactScanner } from '@/generator/scanner';
import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'custom', 'src');
const PLAIN = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'artifacts');

describe('ArtifactScanner - decorators an application defined', () => {
  const scan = () =>
    ArtifactScanner.getInstance()
      .scan({ root: ROOT })
      .map((artifact) => `${artifact.type}:${artifact.className}`);

  test('finds a class by the type of the ArtifactTypes.define its decorator comes from', () => {
    expect(scan()).toEqual(['emitter:MailEmitter', 'emitter:OrderEmitter', 'local:LocalThing']);
  });

  test('follows an import, a renaming re-export and a definition in the class file itself', () => {
    const found = scan();

    expect(found).toContain('emitter:OrderEmitter');
    expect(found).toContain('emitter:MailEmitter');
    expect(found).toContain('local:LocalThing');
  });

  test('a decorator that is not a define, or whose type is not a string literal, marks nothing', () => {
    const names = scan().map((entry) => entry.split(':')[1]);

    expect(names).not.toContain('PlainDecorated');
    expect(names).not.toContain('DynamicDecorated');
  });

  test('an abstract class is skipped, as a built-in one is', () => {
    const { skipped } = ArtifactScanner.getInstance().scanWithReport({ root: ROOT });

    expect(skipped.map((entry) => `${entry.className}:${entry.reason}`)).toContain(
      'AbstractEmitter:abstract',
    );
  });

  test('the built-in stereotypes still scan as before in a tree with no define', () => {
    const types = ArtifactScanner.getInstance()
      .scan({ root: PLAIN })
      .map((artifact) => artifact.type);

    expect(types.some((type) => ArtifactStereotypes.isBuiltIn({ type }))).toBe(true);
    expect(types.every((type) => ArtifactStereotypes.isBuiltIn({ type }))).toBe(true);
  });
});

describe('ArtifactIndexEmitter - custom types', () => {
  const artifacts = ArtifactScanner.getInstance().scan({ root: ROOT });
  const outFile = join(ROOT, 'generated', 'artifacts.ts');

  test('writes a custom field after the built-in ones, one list per type', () => {
    const content = ArtifactIndexEmitter.render({
      artifacts,
      outFile,
      exportName: 'GeneratedArtifacts',
      command: { root: 'src', out: 'src/generated/artifacts.ts' },
    });

    expect(content).toContain(
      [
        '  controllers: [],',
        '  custom: {',
        '    emitter: [MailEmitter, OrderEmitter],',
        '    local: [LocalThing],',
        '  },',
        '};',
      ].join('\n'),
    );
  });

  test('writes no custom field when no type was defined', () => {
    const content = ArtifactIndexEmitter.render({
      artifacts: ArtifactScanner.getInstance().scan({ root: PLAIN }),
      outFile: join(PLAIN, 'generated', 'artifacts.ts'),
      exportName: 'GeneratedArtifacts',
      command: { root: 'src', out: 'src/generated/artifacts.ts' },
    });

    expect(content).not.toContain('custom');
  });
});

describe('the loaders - custom types', () => {
  test('importIndex lists the classes of a custom type under custom, in class-name order', async () => {
    const filePath = join(ROOT, 'plain', 'things.ts');
    const index = await AutoArtifactsLoader.importIndex({
      artifacts: [
        { type: 'emitter', className: 'PlainThing', filePath },
        { type: 'emitter', className: 'OtherThing', filePath },
      ],
    });

    expect(index.custom?.emitter?.map((target) => target.name)).toEqual([
      'OtherThing',
      'PlainThing',
    ]);
    expect(index.services).toBeUndefined();
  });

  test('importIndex writes no custom field when no type was defined', async () => {
    const index = await AutoArtifactsLoader.importIndex({ artifacts: [] });

    expect(index.custom).toBeUndefined();
  });
});
