import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikiBuild } from '../wiki-build';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const home =
  '<footer class="vh site-footer"><canvas class="dust"></canvas></footer><canvas class="dust"></canvas>';

/** A built site: the home page, one inner page, and a build log file next to them. */
const makeSite = (opts: { homeHtml: string; innerHtml: string | null; log: string }) => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-wiki-build-'));
  const dist = join(root, 'docs', 'wiki', 'site', '.vitepress', 'dist');
  const logFile = join(root, 'build.log');

  roots.push(root);
  mkdirSync(join(dist, 'references'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), opts.homeHtml);

  if (opts.innerHtml !== null) {
    writeFileSync(join(dist, 'references', 'index.html'), opts.innerHtml);
  }

  writeFileSync(logFile, opts.log);

  return { root, dist, logFile };
};

describe('WikiBuild', () => {
  // one line per pattern, so each pattern must be the one that catches its line
  test.each([
    ['a ReferenceError', 'ReferenceError: matchMedia is not defined'],
    ['a TypeError or SyntaxError', 'TypeError: x.map is not a function'],
    ['a TypeError or SyntaxError', 'SyntaxError: Unexpected token'],
    ['"is not defined"', 'window is not defined'],
    ['a Vue warning', '[Vue warn]: Unhandled error during execution of setup function'],
    ['a hydration message', 'Hydration completed but contains mismatches'],
  ])('a build log line with %s is a problem', (name, line) => {
    const log = ['- rendering pages...', line, 'build complete in 5s.'].join('\n');
    const problems = WikiBuild.scanLog({ log });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
  });

  test('a clean build log has no problem', () => {
    expect(
      WikiBuild.scanLog({ log: '- building client + server bundles...\nbuild complete in 5s.' }),
    ).toEqual([]);
  });

  test('the home page needs its footer and two canvases', () => {
    expect(WikiBuild.scanHome({ html: home })).toEqual([]);
    expect(WikiBuild.scanHome({ html: '<div class="vh"></div>' })).toHaveLength(2);
    expect(
      WikiBuild.scanHome({ html: '<footer class="vh site-footer"></footer><canvas></canvas>' }),
    ).toHaveLength(1);
    expect(WikiBuild.scanHome({ html: '<canvas></canvas><canvas></canvas>' })).toHaveLength(1);
  });

  test('an inner page must have no footer', () => {
    expect(WikiBuild.scanInner({ html: '<main></main>', page: 'references/index.html' })).toEqual(
      [],
    );
    expect(WikiBuild.scanInner({ html: home, page: 'references/index.html' })).toHaveLength(1);
  });

  test('a built site is checked as a whole', () => {
    const site = makeSite({ homeHtml: home, innerHtml: '<main></main>', log: '' });

    expect(WikiBuild.check({ dist: site.dist, log: '' })).toEqual([]);
    // one problem from the log, two from a home page that lost its footer and canvases
    writeFileSync(join(site.dist, 'index.html'), '<div class="vh"></div>');
    expect(WikiBuild.check({ dist: site.dist, log: 'ReferenceError: x' })).toHaveLength(3);
    expect(WikiBuild.check({ dist: join(site.dist, 'missing'), log: '' })).toHaveLength(1);
  });

  test('a site with no inner page to look at is not sound: it must not be skipped silently', () => {
    const site = makeSite({ homeHtml: home, innerHtml: null, log: '' });

    expect(WikiBuild.check({ dist: site.dist, log: '' })).toHaveLength(1);
  });

  test('run returns 0 for a sound site and 1 for a broken one, and 1 for a missing log', () => {
    const sound = makeSite({
      homeHtml: home,
      innerHtml: '<main></main>',
      log: 'build complete in 5s.',
    });
    const broken = makeSite({
      homeHtml: '<div class="vh"></div>',
      innerHtml: '<main></main>',
      log: 'ReferenceError: window is not defined',
    });

    expect(WikiBuild.run({ root: sound.root, logFile: sound.logFile })).toBe(0);
    expect(WikiBuild.run({ root: broken.root, logFile: broken.logFile })).toBe(1);
    expect(WikiBuild.run({ root: sound.root, logFile: join(sound.root, 'absent.log') })).toBe(1);
  });
});
