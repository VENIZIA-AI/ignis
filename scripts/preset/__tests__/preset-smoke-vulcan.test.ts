import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultVulcanCommand } from '../preset-smoke';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'ignis-smoke-vulcan-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const rootWith = (devDependencies: Record<string, string>): string => {
  const folder = mkdtempSync(join(scratch, 'root-'));
  writeFileSync(join(folder, 'package.json'), JSON.stringify({ devDependencies }));
  return folder;
};

describe('defaultVulcanCommand - the preset smoke never runs an unpinned VULCAN', () => {
  test('names the version the repository declares', () => {
    const root = rootWith({ '@venizia/vulcan': '0.4.9' });

    expect(defaultVulcanCommand({ root })).toBe('bun x @venizia/vulcan@0.4.9');
  });

  test('this repository pins an exact version, not a tag', () => {
    expect(defaultVulcanCommand({ root: ROOT })).toMatch(/^bun x @venizia\/vulcan@\d+\.\d+\.\d+$/);
  });

  test('refuses a tag or a missing declaration instead of falling back to latest', () => {
    expect(() => defaultVulcanCommand({ root: rootWith({ '@venizia/vulcan': 'latest' }) })).toThrow(
      /exact version/,
    );
    expect(() => defaultVulcanCommand({ root: rootWith({}) })).toThrow(/exact version/);
  });
});
