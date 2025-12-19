import { discoverFiles, isClass, loadClasses } from '@/utilities/boot.utility';
import { describe, test, expect, beforeAll } from 'bun:test';
import path from 'node:path';

describe('Boot Utility Tests', () => {
  let root: string;
  beforeAll(() => {
    root = path.resolve(process.cwd(), 'dist/cjs/__tests__/fixtures');
  });
  // --------------------------------------------------------------------------------
  describe('isClass', () => {
    test('should return true for class constructors', () => {
      class TestClass {}
      abstract class AbstractClass {}
      function FunctionClass() {}

      expect(isClass(TestClass)).toBe(true);
      expect(isClass(AbstractClass)).toBe(true);
      expect(isClass(FunctionClass)).toBe(true);
    });

    test('should return false for non-class types', () => {
      const ArrowFunction = () => {};
      const obj = {};
      const str = 'string';
      const num = 1;
      const isBool = true;
      const nil = null;
      const undef = undefined;

      expect(isClass(ArrowFunction)).toBe(false);
      expect(isClass(obj)).toBe(false);
      expect(isClass(str)).toBe(false);
      expect(isClass(num)).toBe(false);
      expect(isClass(isBool)).toBe(false);
      expect(isClass(nil)).toBe(false);
      expect(isClass(undef)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------------
  describe('discoverFiles', () => {
    test('should return files matching the nested glob pattern', async () => {
      const pattern = '**/*.repository.js';
      const files = await discoverFiles({ pattern, root });
      expect(files.length).toBeGreaterThan(0);
    });

    test('should return files matching the non-nested glob pattern', async () => {
      const pattern = 'repositories/sub-repositories/*.repository.js';
      const files = await discoverFiles({ pattern, root });
      expect(files.length).toBeGreaterThan(0);
    });

    test('should return files matching the specific glob pattern', async () => {
      const pattern = 'repositories/sub-repositories/model3.repository.js';
      const files = await discoverFiles({ pattern, root });
      expect(files.length).toBe(1);
    });

    test('should return an empty array if no files match', async () => {
      const pattern = '**/*.nonexistent';
      root = process.cwd();

      const files = await discoverFiles({ pattern, root });
      expect(files).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------------
  describe('loadClasses', () => {
    test('should load classes from files', async () => {
      const pattern = 'repositories/*.repository.js';
      const files = await discoverFiles({ pattern, root });

      const classes = await loadClasses({ files, root });
      expect(classes.length).toBeGreaterThan(0);
    });

    test('should return an empty array if no classes found', async () => {
      const pattern = 'non-repositories/*.repository.js';
      const files = await discoverFiles({ pattern, root });

      const classes = await loadClasses({ files, root });
      expect(classes).toEqual([]);
    });
  });
});
