import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

/**
 * `@venizia/dev-configs/linters/oxlint` exists so an oxlint config loads no ESLint: that saves about
 * a second per run. Nothing in the type system guards it, since one runtime import in any module the
 * entry reaches brings ESLint back. The check loads the built entry in a fresh process and lists every
 * module that process loaded. It reads the build output as it is; it builds nothing.
 */

const DEV_CONFIGS_DIR = resolve(import.meta.dir, '..', '..', '..', 'packages', 'dev-configs');
const SUBPATH_ENTRY = join(DEV_CONFIGS_DIR, 'dist', 'linters', 'oxlint-presets.js');
const BARREL_ENTRY = join(DEV_CONFIGS_DIR, 'dist', 'linters', 'index.js');

const ESLINT_PATH_MARKERS = ['/eslint', 'typescript-eslint', '@typescript-eslint', 'eslint-plugin'];

const LOADED_MODULES_PROBE =
  'require(process.env.PROBE_ENTRY); process.stdout.write(JSON.stringify(Object.keys(require.cache)));';

const loadedModules = (opts: { entry: string }): string[] => {
  const child = Bun.spawnSync({
    cmd: [process.execPath, '-e', LOADED_MODULES_PROBE],
    env: { ...process.env, PROBE_ENTRY: opts.entry },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return JSON.parse(child.stdout.toString());
};

describe('@venizia/dev-configs/linters/oxlint', () => {
  test('the export map points at the entry the check loads', () => {
    const manifest = JSON.parse(readFileSync(join(DEV_CONFIGS_DIR, 'package.json'), 'utf8'));
    const target = manifest.exports['./linters/oxlint'].default;
    expect(resolve(DEV_CONFIGS_DIR, target)).toBe(SUBPATH_ENTRY);
  });

  test('loads no ESLint module', () => {
    const modules = loadedModules({ entry: SUBPATH_ENTRY });
    expect(modules.some(path => path.includes('oxlint-presets'))).toBe(true);

    const eslintModules = modules.filter(path =>
      ESLINT_PATH_MARKERS.some(marker => path.includes(marker)),
    );
    const sample = eslintModules.slice(0, 3).join(', ');
    expect(
      eslintModules.length,
      `${eslintModules.length} ESLint modules reached from the oxlint subpath, e.g. ${sample}`,
    ).toBe(0);
  });

  test('exports the same values as the barrel', () => {
    const requireFrom = createRequire(import.meta.url);
    const subpath: Record<string, unknown> = requireFrom(SUBPATH_ENTRY);
    const barrel: Record<string, unknown> = requireFrom(BARREL_ENTRY);

    const names = Object.keys(subpath);
    expect(names.length).toBeGreaterThan(0);

    const differing = names.filter(name => !(name in barrel) || barrel[name] !== subpath[name]);
    expect(differing, `not the barrel's value: ${differing.join(', ')}`).toEqual([]);
  });
});
