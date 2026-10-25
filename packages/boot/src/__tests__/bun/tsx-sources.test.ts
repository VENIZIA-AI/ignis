import { ArtifactScanCache, ArtifactSources } from '@/bun';
import { ArtifactScanner } from '@/generator';
import { describe, expect, test } from 'bun:test';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const APP = resolve(process.cwd(), 'src', '__tests__', 'fixtures', 'tsx', 'app');
const SOURCE = resolve(APP, 'src');

describe('a decorated class in a .tsx file', () => {
  test('is scanned like one in a .ts file', () => {
    const names = ArtifactScanner.getInstance()
      .scan({ root: SOURCE })
      .map((artifact) => artifact.className)
      .sort();
    expect(names).toEqual(['ListController', 'ViewController']);
  });

  test('maps to its compiled .js copy when the application runs from dist', () => {
    const app = mkdtempSync(resolve(tmpdir(), 'ignis-tsx-'));
    try {
      cpSync(APP, app, { recursive: true });
      mkdirSync(resolve(app, 'dist', 'controllers'), { recursive: true });
      for (const name of ['list', 'view']) {
        writeFileSync(resolve(app, 'dist', 'controllers', `${name}.controller.js`), '');
      }

      const artifacts = ArtifactScanner.getInstance().scan({ root: resolve(app, 'src') });
      const running = ArtifactSources.runningArtifacts({
        artifacts,
        from: resolve(app, 'dist', 'index.js'),
      });
      expect(running.map((artifact) => artifact.filePath).sort()).toEqual([
        resolve(app, 'dist', 'controllers', 'list.controller.js'),
        resolve(app, 'dist', 'controllers', 'view.controller.js'),
      ]);
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  });

  test('is part of the scan cache fingerprint', () => {
    const file = resolve(SOURCE, 'controllers', 'view.controller.tsx');
    const { atime, mtime } = statSync(file);
    const before = ArtifactScanCache.fingerprint({ root: SOURCE });
    utimesSync(file, atime, new Date(mtime.getTime() + 1000));
    const after = ArtifactScanCache.fingerprint({ root: SOURCE });
    utimesSync(file, atime, mtime);
    expect(after).not.toBe(before);
  });
});
