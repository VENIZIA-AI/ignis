import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ReleaseStamp } from '../stamp-release';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const LOG = "---\ntitle: 0.4.8\nversion: 0.4.8\npackages: ['@x/core']\n---\nThe line.\n";

/** A project with the manifest of a release and, when `log` is given, the folder of 0.4.8. */
const project = (opts: { log?: string }): string => {
  const root = mkdtempSync(join(tmpdir(), 'stamp-release-'));

  roots.push(root);
  mkdirSync(join(root, '.agents'), { recursive: true });
  writeFileSync(
    join(root, '.agents', 'vulcan.manifest.json'),
    JSON.stringify({
      release: { tagPattern: '<dir>-v<version>' },
      knowledge: { changelogs: 'docs/changelogs' },
      packages: [{ name: '@x/core', dir: 'core-server' }],
    }),
  );

  if (opts.log !== undefined) {
    mkdirSync(join(root, 'docs', 'changelogs', '0.4.8'), { recursive: true });
    writeFileSync(join(root, 'docs', 'changelogs', '0.4.8', 'log.md'), opts.log);
  }

  return root;
};

const logOf = (root: string): string =>
  readFileSync(join(root, 'docs', 'changelogs', '0.4.8', 'log.md'), 'utf8');

describe('ReleaseStamp.stamped', () => {
  test('writes released: as the last frontmatter line and leaves the body alone', () => {
    expect(ReleaseStamp.stamped({ text: LOG, date: '2026-11-20' })).toBe(
      "---\ntitle: 0.4.8\nversion: 0.4.8\npackages: ['@x/core']\nreleased: 2026-11-20\n---\nThe line.\n",
    );
  });

  test('keeps the line endings of a log written with CRLF', () => {
    expect(ReleaseStamp.stamped({ text: LOG.replaceAll('\n', '\r\n'), date: '2026-11-20' })).toBe(
      "---\r\ntitle: 0.4.8\r\nversion: 0.4.8\r\npackages: ['@x/core']\r\nreleased: 2026-11-20\r\n---\r\nThe line.\r\n",
    );
  });

  test('a log that already says that date is left as it is; another date is refused', () => {
    const stamped = ReleaseStamp.stamped({ text: LOG, date: '2026-11-20' }) ?? '';

    expect(ReleaseStamp.stamped({ text: stamped, date: '2026-11-20' })).toBeUndefined();
    expect(() => ReleaseStamp.stamped({ text: stamped, date: '2026-11-21' })).toThrow('frozen');
  });

  test('a log with no frontmatter is refused', () => {
    expect(() => ReleaseStamp.stamped({ text: 'no frontmatter\n', date: '2026-11-20' })).toThrow(
      'no frontmatter',
    );
  });

  test('a released: in the body is not the folder being released', () => {
    const text = `${LOG}released: 2020-01-01\n`;

    expect(ReleaseStamp.stamped({ text, date: '2026-11-20' })).toContain(
      'released: 2026-11-20\n---',
    );
  });
});

describe('ReleaseStamp.main', () => {
  const args = (opts: { version?: string; date?: string }): string[] => [
    '--version',
    opts.version ?? '0.4.8',
    '--date',
    opts.date ?? '2026-11-20',
  ];

  test('stamps the folder of the version and prints its path, so the loop can git add it', () => {
    const root = project({ log: LOG });
    const printed: string[] = [];
    const log = spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      printed.push(parts.join(' '));
    });

    try {
      expect(ReleaseStamp.main({ args: args({}), cwd: root })).toBe(0);
    } finally {
      log.mockRestore();
    }

    expect(logOf(root)).toContain('released: 2026-11-20\n---');
    expect(printed).toEqual([join(root, 'docs', 'changelogs', '0.4.8', 'log.md')]);
  });

  test('a second run on the same day changes nothing and still prints the path', () => {
    const root = project({ log: LOG });

    expect(ReleaseStamp.main({ args: args({}), cwd: root })).toBe(0);

    const once = logOf(root);

    expect(ReleaseStamp.main({ args: args({}), cwd: root })).toBe(0);
    expect(logOf(root)).toBe(once);
  });

  test('a version with no folder writes nothing, prints nothing and succeeds', () => {
    const root = project({});
    const printed: string[] = [];
    const log = spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      printed.push(parts.join(' '));
    });

    try {
      expect(ReleaseStamp.main({ args: args({}), cwd: root })).toBe(0);
    } finally {
      log.mockRestore();
    }

    expect(printed).toEqual([]);
  });

  test('a malformed version or date exits 2; a frozen folder with another date exits 1 and keeps its date', () => {
    const root = project({ log: LOG.replace('---\nThe', 'released: 2026-11-01\n---\nThe') });
    const before = logOf(root);

    expect(ReleaseStamp.main({ args: args({ version: 'latest' }), cwd: root })).toBe(2);
    expect(ReleaseStamp.main({ args: args({ version: '0.4.8-1' }), cwd: root })).toBe(2);
    expect(ReleaseStamp.main({ args: args({ date: 'today' }), cwd: root })).toBe(2);
    expect(ReleaseStamp.main({ args: ['--version', '0.4.8'], cwd: root })).toBe(2);
    expect(ReleaseStamp.main({ args: args({}), cwd: root })).toBe(1);
    expect(logOf(root)).toBe(before);
  });
});

describe('the real changelog of this repository', () => {
  test('the log.md of 0.4.8 takes a date, so its stable can be released', () => {
    const folder = resolve(import.meta.dir, '../../../docs/wiki/content/changelogs/0.4.8/log.md');

    expect(
      ReleaseStamp.stamped({ text: readFileSync(folder, 'utf8'), date: '2099-01-01' }),
    ).toContain('\nreleased: 2099-01-01\n---\n');
  });
});
