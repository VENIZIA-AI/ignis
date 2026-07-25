import { discoverFiles, loadClasses } from '@/utilities/boot.utility';
import { describe, test, expect, beforeAll } from 'bun:test';
import path from 'node:path';

describe('Boot Utility Tests', () => {
  let root: string;
  beforeAll(() => {
    root = path.resolve(process.cwd(), 'dist/cjs/__tests__/fixtures');
  });

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

      // A local root on purpose: `root` is shared file-wide (beforeAll, not beforeEach), so mutating it here poisons every later test.
      const files = await discoverFiles({ pattern, root: process.cwd() });
      expect(files).toEqual([]);
    });
  });

  describe('loadClasses', () => {
    test('should load classes from files', async () => {
      const pattern = 'repositories/*.repository.js';
      const files = await discoverFiles({ pattern, root });

      const classes = await loadClasses({ files });
      expect(classes.length).toBeGreaterThan(0);
    });

    test('should return an empty array if no classes found', async () => {
      const pattern = 'non-repositories/*.repository.js';
      const files = await discoverFiles({ pattern, root });

      const classes = await loadClasses({ files });
      expect(classes).toEqual([]);
    });

    test('loads ONLY the class from a file that also exports functions and constants', async () => {
      const pattern = 'mixed-exports/*.repository.js';
      const files = await discoverFiles({ pattern, root });
      expect(files).toHaveLength(1);

      const classes = await loadClasses({ files });

      // The file also exports `buildWhereClause`, `normalizeId` and `TABLE_NAME`; binding one as an artifact means the booter eventually does `new buildWhereClause()`.
      expect(classes.map(loaded => loaded.name)).toEqual(['MixedRepository']);
    });
  });
});
