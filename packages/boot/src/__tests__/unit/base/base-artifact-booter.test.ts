import { BaseArtifactBooter } from '@/base';
import { beforeAll, describe, expect, test } from 'bun:test';
import path from 'node:path';

class TestBooter extends BaseArtifactBooter {
  protected override getDefaultDirs(): string[] {
    return ['repositories'];
  }
  protected override getDefaultExtensions(): string[] {
    return ['.repository.js'];
  }
  protected override bind(): Promise<void> {
    return Promise.resolve();
  }
}

describe('Base Artifact Booter Tests', () => {
  let booter: TestBooter;
  const root = path.resolve(process.cwd(), 'dist/cjs/__tests__/fixtures');

  beforeAll(() => {
    booter = new TestBooter({ root, artifactOptions: {}, scope: TestBooter.name });
  });

  describe('configure', () => {
    test('an EXPLICITLY undefined option still falls back to the default', async () => {
      // The realistic shape: `dirs: process.env.APP_DIRS?.split(',')`. The key exists and holds
      // undefined, so a trailing `...artifactOptions` spread would overwrite the computed default
      // back to undefined - and getPattern() would then throw "No directories specified".
      const undefinedBooter = new TestBooter({
        scope: TestBooter.name,
        root,
        artifactOptions: { dirs: undefined, extensions: undefined, isNested: undefined },
      });

      await undefinedBooter.configure();

      expect(undefinedBooter['artifactOptions'].dirs).toEqual(['repositories']);
      expect(undefinedBooter['artifactOptions'].extensions).toEqual(['.repository.js']);
      expect(undefinedBooter['artifactOptions'].isNested).toBe(true);
    });

    test('should use defaults', async () => {
      await booter.configure();
      expect(booter['artifactOptions'].dirs).toEqual(['repositories']);
      expect(booter['artifactOptions'].extensions).toEqual(['.repository.js']);
      expect(booter['artifactOptions'].isNested).toEqual(true);
      expect(booter['artifactOptions'].glob).toBeUndefined();
    });

    test('should override with provided options', async () => {
      const customBooter = new TestBooter({
        scope: TestBooter.name,
        root,
        artifactOptions: {
          dirs: ['custom-dir'],
          extensions: ['.custom.js'],
          isNested: true,
          glob: 'custom/glob/pattern/**/*.js',
        },
      });
      await customBooter.configure();
      expect(customBooter['artifactOptions'].dirs).toEqual(['custom-dir']);
      expect(customBooter['artifactOptions'].extensions).toEqual(['.custom.js']);
      expect(customBooter['artifactOptions'].isNested).toEqual(true);
      expect(customBooter['artifactOptions'].glob).toEqual('custom/glob/pattern/**/*.js');
    });
  });

  describe('getPattern', () => {
    test('should generate pattern with defaults', async () => {
      await booter.configure();
      const pattern = booter['getPattern']();
      expect(pattern).toBe('repositories/{**/*,*}.repository.js');
    });

    test('should generate pattern with multiple dirs and extensions', async () => {
      const multiBooter = new TestBooter({
        scope: TestBooter.name,
        root,
        artifactOptions: {
          dirs: ['dir1', 'dir2'],
          extensions: ['.ext1.js', '.ext2.js'],
        },
      });
      await multiBooter.configure();
      const pattern = multiBooter['getPattern']();
      expect(pattern).toBe('{dir1,dir2}/{**/*,*}.{ext1.js,ext2.js}');
    });

    test('should use custom glob if provided', async () => {
      const globBooter = new TestBooter({
        scope: TestBooter.name,
        root,
        artifactOptions: {
          glob: 'custom/glob/pattern/**/*.js',
        },
      });
      await globBooter.configure();
      const pattern = globBooter['getPattern']();
      expect(pattern).toBe('custom/glob/pattern/**/*.js');
    });
  });

  describe('discover', () => {
    test('should discover files based on pattern', async () => {
      await booter.configure();
      await booter.discover();
      expect(booter['discoveredFiles'].length).toBeGreaterThan(0);
    });

    test('should discover no files if pattern matches none', async () => {
      const noFileBooter = new TestBooter({
        scope: TestBooter.name,
        root,
        artifactOptions: {
          glob: 'nonexistent/**/*.js',
        },
      });
      await noFileBooter.configure();
      await noFileBooter.discover();
      expect(noFileBooter['discoveredFiles'].length).toBe(0);
    });
  });

  describe('load', () => {
    test('should load classes from discovered files', async () => {
      await booter.configure();
      await booter.discover();
      await booter.load();
      expect(booter['loadedClasses'].length).toBeGreaterThan(0);
    });
  });
});
