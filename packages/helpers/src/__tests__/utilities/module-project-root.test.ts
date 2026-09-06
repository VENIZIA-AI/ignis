import { ModuleUtility } from '@/utilities/module.utility';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** A throwaway project root with one installable package; under $HOME because /tmp is quota-limited on some machines. */
const buildProjectRoot = (): string => {
  const cacheDirectory = join(homedir(), '.cache');
  mkdirSync(cacheDirectory, { recursive: true });
  const root = mkdtempSync(join(cacheDirectory, 'ignis-project-root-'));
  const packageDirectory = join(root, 'node_modules', 'probe-peer');
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(
    join(packageDirectory, 'package.json'),
    JSON.stringify({ name: 'probe-peer', main: 'index.js' }),
  );
  writeFileSync(join(packageDirectory, 'index.js'), 'module.exports = { fromProjectRoot: true };');
  return root;
};

describe('ModuleUtility - project root', () => {
  const roots: string[] = [];

  afterEach(() => {
    ModuleUtility.setProjectRoot({ projectRoot: process.cwd() });
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('defaults to the process cwd', () => {
    expect(ModuleUtility.getProjectRoot()).toBe(process.cwd());
  });

  test('a peer under the configured root is found; the same peer is unreachable from the cwd (positive control)', () => {
    const root = buildProjectRoot();
    roots.push(root);

    expect(() => ModuleUtility.loadSync({ module: 'probe-peer' })).toThrow('probe-peer');
    expect(() => ModuleUtility.assertInstalled({ modules: ['probe-peer'] })).toThrow('probe-peer');

    ModuleUtility.setProjectRoot({ projectRoot: root });

    expect(ModuleUtility.getProjectRoot()).toBe(root);
    expect(ModuleUtility.loadSync<{ fromProjectRoot: boolean }>({ module: 'probe-peer' })).toEqual({
      fromProjectRoot: true,
    });
    expect(() => ModuleUtility.assertInstalled({ modules: ['probe-peer'] })).not.toThrow();
  });

  test('the root lives in a globalThis slot, so a second module copy reads the same value', () => {
    const root = buildProjectRoot();
    roots.push(root);
    ModuleUtility.setProjectRoot({ projectRoot: root });

    expect(Reflect.get(globalThis, Symbol.for('ignis:project-root'))).toBe(root);
  });
});
