import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AnchorCheck } from '../wiki-anchors';

const tmpDirs: string[] = [];

const writeFixture = (opts: { root: string; relPath: string; content: string }): void => {
  const full = join(opts.root, opts.relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, opts.content);
};

/**
 * A disposable pair of trees shaped like the real ones: `content/` holds the markdown, `dist/` holds
 * html carrying the ids VitePress would have emitted. The html is written by hand precisely because
 * the point of the gate is to read emitted ids rather than recompute a slug.
 */
const makeFixture = (): { content: string; dist: string } => {
  const root = mkdtempSync(join(tmpdir(), 'ignis-wiki-anchors-'));
  tmpDirs.push(root);
  const content = join(root, 'content');
  const dist = join(root, 'dist');

  // `Construction - Sentinel` is the case a GitHub slugifier gets wrong: it would expect
  // `construction---sentinel`, and would then call this working link broken.
  writeFixture({
    root: dist,
    relPath: 'guides/setup.html',
    content: '<h2 id="construction-sentinel">x</h2><h2 id="step-2-install">y</h2>',
  });
  writeFixture({ root: dist, relPath: 'guides/index.html', content: '<h2 id="overview">z</h2>' });
  writeFixture({ root: dist, relPath: 'reference.html', content: '<h2 id="api">a</h2>' });

  writeFixture({
    root: content,
    relPath: 'guides/setup.md',
    content: [
      '# Setup',
      '',
      'Same page: [Sentinel](#construction-sentinel)',
      'Same page dead: [Gone](#no-such-heading)',
      'Relative: [Overview](./index.md#overview)',
      'Absolute: [Api](/reference#api)',
      'External: [Spec](https://example.com/page#frag)',
      '',
      '```markdown',
      'Fenced: [Fake](#not-a-real-anchor)',
      '```',
      '',
    ].join('\n'),
  });
  writeFixture({
    root: content,
    relPath: 'guides/index.md',
    content: [
      '# Guides',
      '',
      'Up one: [Api](../reference.md#api)',
      'Missing page: [X](/nope#api)',
      '',
    ].join('\n'),
  });

  return { content, dist };
};

afterAll(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('AnchorCheck', () => {
  const { content, dist } = makeFixture();
  const { checked, broken } = AnchorCheck.fromDist({ dist }).run({ content });

  test('counts every resolvable link and skips external and fenced ones', () => {
    // 4 in setup.md (same-page x2, relative, absolute) + 2 in index.md. The https link and the
    // fenced one are not ours to resolve.
    expect(checked).toBe(6);
  });

  test('accepts an id VitePress emits but a GitHub slugifier would not', () => {
    expect(broken.map(entry => entry.target)).not.toContain('#construction-sentinel');
  });

  test('reports a dead fragment on an existing page, with its line', () => {
    const dead = broken.find(entry => entry.target === '#no-such-heading');
    expect(dead?.reason).toBe('dead anchor');
    expect(dead?.line).toBe(4);
  });

  test('reports a link to a page that does not exist', () => {
    const missing = broken.find(entry => entry.target === '/nope#api');
    expect(missing?.reason).toBe('missing page');
  });

  test('resolves relative, parent-relative and absolute targets', () => {
    const targets = broken.map(entry => entry.target);
    expect(targets).not.toContain('./index.md#overview');
    expect(targets).not.toContain('../reference.md#api');
    expect(targets).not.toContain('/reference#api');
  });

  test('finds exactly the two planted defects', () => {
    expect(broken).toHaveLength(2);
  });
});
