/**
 * The changelog sidebar in `config.mts` is hand-maintained, so it drifts: nine entries went missing
 * between 2026-07-20 and 2026-08-02 with a green build every time, because an unlinked page is not a
 * dead link. This fails the build instead.
 *
 * `content/changelogs/index.md` is the authority - it is a table every entry already has to appear
 * in, and it is what a reader lands on.
 */
import { Glob } from 'bun';

const WIKI = new URL('..', import.meta.url).pathname;
const CONTENT = `${WIKI}content`;
const CONFIG = `${WIKI}site/.vitepress/config.mts`;

/** Author-facing skeletons, deliberately never linked from a reader-facing menu. */
const UNLISTED = [/^extensions\/(components|helpers)\/template\//, /^index$/];

const config = await Bun.file(CONFIG).text();
const linked = new Set(
  [...config.matchAll(/link:\s*'([^']+)'/g)]
    .map(m => m[1])
    .filter(l => !l.startsWith('http'))
    .map(l => l.replace(/#.*$/, '').replace(/^\//, '').replace(/\/$/, '/index')),
);

const pages: Array<string> = [];
for await (const file of new Glob('**/*.md').scan(CONTENT)) {
  pages.push(file.replace(/\.md$/, ''));
}

const orphans = pages
  .filter(page => !UNLISTED.some(pattern => pattern.test(page)))
  .filter(page => {
    const asDirectory = page.endsWith('/index') ? page.slice(0, -'/index'.length) : null;
    return !linked.has(page) && !(asDirectory !== null && linked.has(asDirectory));
  });

const dead = [...new Set([...linked])].filter(link => {
  const candidates = [link, `${link}/index`, link.replace(/\/index$/, '')];
  return !candidates.some(candidate => pages.includes(candidate));
});

const problems: Array<string> = [];
if (orphans.length > 0) {
  problems.push(`${orphans.length} page(s) no menu links to:\n  ${orphans.sort().join('\n  ')}`);
}
if (dead.length > 0) {
  problems.push(`${dead.length} menu link(s) with no page:\n  ${dead.sort().join('\n  ')}`);
}

if (problems.length > 0) {
  console.error(`sidebar check FAILED\n\n${problems.join('\n\n')}\n`);
  console.error('Add the entry to site/.vitepress/config.mts, or to UNLISTED if it is a template.');
  process.exit(1);
}

console.log(`sidebar OK - ${pages.length} pages, ${linked.size} links, no orphan and no dead link`);
