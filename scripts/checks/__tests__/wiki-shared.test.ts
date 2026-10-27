/**
 * The shared wiki theme must be the same in IGNIS, ARDOR and VULCAN. This file is identical in the
 * three repositories and depends on nothing of this one: it recomputes the hashes of the shared
 * folder and compares them with its SHARED.json, and checks that the VitePress pieces the shared CSS
 * overrides still exist. The canonical copy is VULCAN's (scripts/wiki-shared there); a copy is never
 * edited by hand.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SHARED = 'docs/wiki/site/.vitepress/theme/shared';
const MANIFEST = 'SHARED.json';

const findRoot = (): string => {
  let dir = import.meta.dir;

  while (!existsSync(join(dir, SHARED))) {
    if (dirname(dir) === dir) {
      throw new Error(`no ${SHARED} above ${import.meta.dir}`);
    }

    dir = dirname(dir);
  }

  return dir;
};

const ROOT = findRoot();
const DIR = join(ROOT, SHARED);

const walk = (relative: string): string[] =>
  readdirSync(join(DIR, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`;

    return entry.isDirectory() ? walk(path) : [path];
  });

const sha256 = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

const hashes = (): Record<string, string> =>
  Object.fromEntries(
    walk('')
      .filter((path) => path !== MANIFEST)
      .sort()
      .map((path) => [path, sha256(readFileSync(join(DIR, path)))]),
  );

const HOW =
  'Edit the canonical copy in VULCAN (docs/wiki/site/.vitepress/theme/shared), run bun scripts/wiki-shared/manifest.ts there, ' +
  'then run bun <vulcan>/scripts/wiki-shared/copy.ts . in this repository.';

describe('the shared wiki theme', () => {
  const manifest: { fingerprint: string; files: Record<string, string> } = JSON.parse(
    readFileSync(join(DIR, MANIFEST), 'utf8'),
  );

  test('every file of the shared folder is what SHARED.json says', () => {
    const actual = hashes();
    const paths = [...new Set([...Object.keys(manifest.files), ...Object.keys(actual)])].sort();
    const problems = paths.flatMap((path) => {
      if (!(path in actual)) {
        return [`missing ${path}`];
      }

      if (!(path in manifest.files)) {
        return [`not in SHARED.json: ${path}`];
      }

      return actual[path] === manifest.files[path] ? [] : [`changed ${path}`];
    });

    expect(problems, `The shared folder drifted from SHARED.json. ${HOW}`).toEqual([]);
  });

  test('the fingerprint is the hash of the sorted path and hash lines', () => {
    const lines = Object.keys(manifest.files)
      .sort()
      .map((path) => `${path} ${manifest.files[path]}\n`)
      .join('');

    expect(manifest.fingerprint).toBe(sha256(lines));
  });
});

type TSelectors = {
  vitepress: string;
  selectors: { selector: string; file: string; needle: string }[];
  slots: { slot: string; file: string; needle: string }[];
};

/** The installed VitePress, found the way node would: the nearest node_modules above the wiki. */
const findVitepress = (): string | null => {
  let dir = join(ROOT, 'docs', 'wiki');

  for (;;) {
    const candidate = join(dir, 'node_modules', 'vitepress');

    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }

    if (dirname(dir) === dir) {
      return null;
    }

    dir = dirname(dir);
  }
};

describe('the VitePress pieces the shared CSS overrides', () => {
  const declared: TSelectors = JSON.parse(
    readFileSync(join(DIR, 'vitepress-selectors.json'), 'utf8'),
  );
  const css = walk('')
    .filter((path) => path.endsWith('.css'))
    .map((path) => readFileSync(join(DIR, path), 'utf8'))
    .join('\n');

  test('every listed selector is used by a shared stylesheet, so the list stays honest', () => {
    const unused = declared.selectors.filter((entry) => !css.includes(entry.selector));

    expect(unused.map((entry) => entry.selector)).toEqual([]);
  });

  test('every listed slot is filled by a shared component', () => {
    const components = walk('')
      .filter((path) => path.endsWith('.vue'))
      .map((path) => readFileSync(join(DIR, path), 'utf8'))
      .join('\n');
    const unused = declared.slots.filter((entry) => !components.includes(`#${entry.slot}`));

    expect(unused.map((entry) => entry.slot)).toEqual([]);
  });

  test('every listed piece still exists in the installed VitePress', () => {
    const installed = findVitepress();

    if (installed === null) {
      throw new Error(
        'VitePress is not installed: run bun install in docs/wiki, then run this again',
      );
    }

    const version: string = JSON.parse(
      readFileSync(join(installed, 'package.json'), 'utf8'),
    ).version;
    const theme = join(installed, 'dist', 'client', 'theme-default');
    const present = (entry: { file: string; needle: string }): boolean =>
      existsSync(join(theme, entry.file)) &&
      readFileSync(join(theme, entry.file), 'utf8').includes(entry.needle);
    const goneSlots = declared.slots
      .filter((entry) => !present(entry))
      .map((entry) => `slot ${entry.slot} (${entry.file})`);
    const gone = declared.selectors.filter(
      (entry) =>
        !existsSync(join(theme, entry.file)) ||
        !readFileSync(join(theme, entry.file), 'utf8').includes(entry.needle),
    );

    expect(
      [...gone.map((entry) => `${entry.selector} (${entry.file})`), ...goneSlots],
      version === declared.vitepress
        ? `vitepress-selectors.json lists pieces that VitePress ${version} does not have; fix the list and the stylesheets together.`
        : `The shared stylesheets were written for VitePress ${declared.vitepress}; ${version} is installed and no longer has these. ` +
            'Read the default theme pieces named in vitepress-selectors.json, update the overrides, then set "vitepress" in that file to the new version.',
    ).toEqual([]);
  });
});
