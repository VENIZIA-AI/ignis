import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COUNTS,
  ENGINES,
  HOME,
  RELEASE_LINE,
  SITE,
  VERSION,
} from '../../../docs/wiki/site/.vitepress/theme/home-content';

const ROOT = join(import.meta.dir, '..', '..', '..');
const CONTENT = join(ROOT, 'docs', 'wiki', 'content');

const readJson = (opts: { path: string }) =>
  JSON.parse(readFileSync(join(ROOT, opts.path), 'utf8'));

const statOf = (opts: { label: string }): string => {
  const stat = HOME.stats.find(([, label]) => label === opts.label);

  if (stat === undefined) {
    throw new Error(`home-content.ts has no stat labelled "${opts.label}"`);
  }

  return stat[0];
};

/** A wiki path such as `/guides/` or `/extensions/components/websocket/` must name a page of the wiki. */
const pageExists = (opts: { href: string }): boolean => {
  const path = opts.href.split('#')[0].replace(/^\/|\/$/g, '');

  return [`${path}.md`, join(path, 'index.md')].some((file) => existsSync(join(CONTENT, file)));
};

const internalLinks = (): string[] => {
  const inHtml = [...HOME.tabs.map((tab) => tab.note ?? ''), HOME.maturityHtml]
    .flatMap((html) => [...html.matchAll(/href="(\/[^"]*)"/g)])
    .map((match) => match[1]);

  return [
    ...HOME.cta.map(([, href]) => href),
    ...HOME.cells.flatMap((cell) => (cell.href ? [cell.href] : [])),
    ...SITE.own.map(([, href]) => href),
    ...inHtml,
  ].filter((href) => href.startsWith('/'));
};

// A number on the first screen of the wiki is a claim: it is checked against the code.
describe('the numbers on the home page', () => {
  test('the packages are the folders of packages/', () => {
    const packages = readdirSync(join(ROOT, 'packages')).filter((directory) =>
      existsSync(join(ROOT, 'packages', directory, 'package.json')),
    );

    expect(COUNTS.packages).toBe(packages.length);
    expect(statOf({ label: 'packages' })).toBe(String(packages.length));
  });

  test('the data engines are connector sub-paths that exist', () => {
    const exported = Object.keys(readJson({ path: 'packages/connectors/package.json' }).exports);

    expect(ENGINES.filter((engine) => !exported.includes(engine))).toEqual([]);
    expect(statOf({ label: 'data engines' })).toBe(String(ENGINES.length));
  });

  test('the release line is the one of the published server package', () => {
    const version: string = readJson({ path: 'packages/core-server/package.json' }).version;

    expect(VERSION).toBe(version);
    expect(statOf({ label: 'release line, pre-1.0' })).toBe(RELEASE_LINE);
    expect(version.startsWith(`${RELEASE_LINE}.`)).toBe(true);
    expect(Number(RELEASE_LINE.split('.')[0])).toBe(0);
  });

  test('the headline says eight parts and there are eight', () => {
    expect(HOME.featuresLede).toContain('Eight parts');
    expect(HOME.cells).toHaveLength(8);
  });
});

describe('the words of the home page', () => {
  test('every link inside the wiki names a page that exists', () => {
    const missing = internalLinks().filter((href) => !pageExists({ href }));

    expect(missing).toEqual([]);
  });

  test('the install lines are the commands of the quickstart', () => {
    const quickstart = readFileSync(
      join(CONTENT, 'guides', 'get-started', '5-minute-quickstart.md'),
      'utf8',
    );

    for (const line of HOME.install.lines) {
      expect(quickstart).toContain(line);
    }
  });

  test('the headline and the closing keep their last words together', () => {
    expect(HOME.title[1]).toBe('IGNIS holds the discipline.');
    expect(HOME.closing.title).toContain('it grows.');
  });

  test('the home page states what is not finished', () => {
    const auth = HOME.cells.find((cell) => cell.name === 'auth');

    expect(auth?.text).toContain('OAuth2 is not implemented');
    expect(auth?.text).toContain('Casbin authorization is experimental');
  });
});
