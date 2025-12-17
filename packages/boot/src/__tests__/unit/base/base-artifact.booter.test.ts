import { TestApplication } from '@/__tests__/fixtures/application';
import { BaseArtifactBooter } from '@/base';
import { IBootableApplication } from '@/common';
import { beforeAll, describe, expect, test } from 'bun:test';

class TestBooter extends BaseArtifactBooter {
  protected override getDefaultDirs(): string[] {
    return ['repositories'];
  }
  protected override getDefaultExtensions(): string[] {
    return ['.repository.js'];
  }
}

describe('Base Artifact Booter Tests', () => {
  let application: IBootableApplication;
  let booter: TestBooter;
  const debug = false;

  beforeAll(() => {
    application = new TestApplication({
      bootOptions: { debug },
    });
    booter = new TestBooter({
      application,
      artifactOptions: {},
    });
  });

  describe('configure', () => {
    test('should use defaults', () => {
      booter.configure();
      expect(booter['artifactOptions'].dirs).toEqual(['repositories']);
      expect(booter['artifactOptions'].extensions).toEqual(['.repository.js']);
      expect(booter['artifactOptions'].nested).toEqual(false);
      expect(booter['artifactOptions'].glob).toBeUndefined();
    });

    test('should override with provided options', () => {
      const customBooter = new TestBooter({
        application,
        artifactOptions: {
          dirs: ['custom-dir'],
          extensions: ['.custom.js'],
          nested: true,
          glob: 'custom/glob/pattern/**/*.js',
        },
      });
      customBooter.configure();
      expect(customBooter['artifactOptions'].dirs).toEqual(['custom-dir']);
      expect(customBooter['artifactOptions'].extensions).toEqual(['.custom.js']);
      expect(customBooter['artifactOptions'].nested).toEqual(true);
      expect(customBooter['artifactOptions'].glob).toEqual('custom/glob/pattern/**/*.js');
    });
  });

  describe('getPattern', () => {
    test('should generate pattern with defaults', async () => {
      await booter.configure();
      const pattern = booter['getPattern']();
      expect(pattern).toBe('repositories/*.repository.js');
    });

    test('should generate pattern with multiple dirs and extensions', async () => {
      const multiBooter = new TestBooter({
        application,
        artifactOptions: {
          dirs: ['dir1', 'dir2'],
          extensions: ['.ext1.js', '.ext2.js'],
        },
      });
      await multiBooter.configure();
      const pattern = multiBooter['getPattern']();
      expect(pattern).toBe('{dir1,dir2}/*.{ext1.js,ext2.js}');
    });

    test('should use custom glob if provided', async () => {
      const globBooter = new TestBooter({
        application,
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
        application,
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
