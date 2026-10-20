/**
 * Checks that every in-page anchor the wiki links to actually exists on the page it names. The
 * sidebar check catches a dead page; nothing caught a dead `#fragment`, so a heading could be
 * renamed and every link into it would keep rendering as a working link that lands at the top of
 * the page.
 *
 * Ground truth is the BUILT html under `docs/wiki/site/.vitepress/dist`, never a slug this script
 * computes. VitePress does not slugify the way GitHub does - a heading like `Construction -
 * Sentinel` becomes `construction-sentinel` here and `construction---sentinel` there - so a
 * reimplemented slugifier reports working links as broken and hides real ones. Reading the emitted
 * `id="..."` removes the guess.
 *
 * Requires a build: run `make docs` first. Run from the repo root: bun scripts/wiki-anchors.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT_DIRECTORY = 'docs/wiki/content';
const DIST_DIRECTORY = 'docs/wiki/site/.vitepress/dist';

/** A link whose target page or fragment does not exist. */
interface IBrokenAnchor {
  file: string;
  line: number;
  target: string;
  reason: 'missing page' | 'dead anchor';
}

const walk = (opts: { dir: string; extension: string }): string[] => {
  const { dir, extension } = opts;
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk({ dir: full, extension });
    }
    return full.endsWith(extension) ? [full] : [];
  });
};

/** `dist/a/b.html` and `dist/a/index.html` both answer to `/a/b` and `/a` respectively. */
const routeOf = (opts: { file: string; root: string; extension: string }): string => {
  const { file, root, extension } = opts;
  const bare = file.slice(root.length + 1).slice(0, -extension.length);
  return `/${bare.replace(/\/?index$/, '')}`.replace(/\/$/, '') || '/';
};

export class AnchorCheck {
  private constructor(private readonly anchorsByRoute: Map<string, Set<string>>) {}

  /** Reads every emitted `id` once, so each markdown link is a map lookup. */
  static fromDist(opts: { dist: string }): AnchorCheck {
    const anchorsByRoute = new Map<string, Set<string>>();
    const files = walk({ dir: opts.dist, extension: '.html' });
    for (const file of files) {
      const route = routeOf({ file, root: opts.dist, extension: '.html' });
      const ids = new Set(
        [...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(match => match[1]),
      );
      anchorsByRoute.set(route, ids);
    }
    return new AnchorCheck(anchorsByRoute);
  }

  /** Resolves a link target - empty (same page), absolute, or relative - to a dist route. */
  private resolveRoute(opts: { fromFile: string; target: string; content: string }): string {
    const { fromFile, target, content } = opts;
    if (target === '') {
      return routeOf({ file: fromFile, root: content, extension: '.md' });
    }
    const bare = target.replace(/\.md$/, '');
    // `a/index` and `a/` are both the route `/a`, exactly as `routeOf` folds `dist/a/index.html`.
    const normalize = (route: string): string =>
      route.replace(/\/?index$/, '').replace(/\/$/, '') || '/';
    if (bare.startsWith('/')) {
      return normalize(bare);
    }
    const dir = fromFile
      .slice(content.length + 1)
      .split('/')
      .slice(0, -1)
      .join('/');
    return normalize(`/${join(dir, bare)}`);
  }

  run(opts: { content: string }): { checked: number; broken: IBrokenAnchor[] } {
    const broken: IBrokenAnchor[] = [];
    let checked = 0;

    const files = walk({ dir: opts.content, extension: '.md' });
    for (const file of files) {
      // Fenced code carries example links that are not ours to resolve.
      const body = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, match =>
        match.replace(/[^\n]/g, ' '),
      );
      const lines = body.split('\n');

      lines.forEach((text, index) => {
        const matches = text.matchAll(/\]\(([^)\s]*?)#([\w.-]+)\)/g);
        for (const match of matches) {
          const [, page, anchor] = match;
          if (page.startsWith('http')) {
            continue;
          }
          checked++;
          const route = this.resolveRoute({ fromFile: file, target: page, content: opts.content });
          const ids = this.anchorsByRoute.get(route);
          if (!ids) {
            broken.push({
              file,
              line: index + 1,
              target: `${page}#${anchor}`,
              reason: 'missing page',
            });
            continue;
          }
          if (!ids.has(anchor)) {
            broken.push({
              file,
              line: index + 1,
              target: `${page}#${anchor}`,
              reason: 'dead anchor',
            });
          }
        }
      });
    }

    return { checked, broken };
  }
}

const run = (): number => {
  if (!existsSync(DIST_DIRECTORY)) {
    console.log('wiki-anchors: no build found - run `make docs` first');
    return 1;
  }

  const check = AnchorCheck.fromDist({ dist: DIST_DIRECTORY });
  const { checked, broken } = check.run({ content: CONTENT_DIRECTORY });
  for (const entry of broken) {
    console.log(`${entry.file}:${entry.line} ${entry.reason}: ${entry.target}`);
  }
  console.log(`wiki-anchors: ${checked} anchors checked, ${broken.length} broken`);
  return broken.length > 0 ? 1 : 0;
};

if (import.meta.main) {
  process.exit(run());
}
