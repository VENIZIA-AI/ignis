/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * Checks a built wiki for what a build that exits 0 can hide, and for what the shared theme promises and a
 * wiki can lose without a test noticing.
 *
 * VitePress renders every page on the server first. A component that touches `window`, `document` or
 * `matchMedia` while it sets up throws there; VitePress prints the error, drops that component from the
 * page and still exits 0, so the built home page lacks it and the browser reports a hydration mismatch.
 * The check fails when:
 *
 *   - the build log holds an error of that kind (`ReferenceError`, `is not defined`, a Vue warning, a
 *     hydration message);
 *   - the built home page has no hero, no footer, fewer than two dust canvases (the hero and the footer
 *     draw one each) or fewer than two `.btn` links in the hero, or its top bar lacks the brand or the
 *     venizia.ai link, or has the old ecosystem switcher;
 *   - the built style sheets lack the button's arrow (the `--arrow-ne` mask on `.btn::after`, and the 40 px
 *     `.btn`) or hold the static dot pattern that the dust replaced;
 *   - a built inner page has a footer (inner pages have none) or lacks the top bar.
 *
 * A hydration warning itself appears only in a browser; the server HTML checked here is its cause.
 * It reads only the built site and, when given one, the log of its build, so it runs the same in each wiki:
 *
 *   bun .../shared/build-check.ts                        build docs/wiki, then check it (VULCAN's `make docs`)
 *   bun .../shared/build-check.ts --check                check the last build, with no log to scan
 *   bun .../shared/build-check.ts --check --log <file>   check the last build and scan the log of that build
 *
 * A wiki whose `docs:build` script already runs its own checks calls it with `--check --log <file>` from that
 * script, after the build. The default mode builds, so it refuses to run inside a docs build (it sets
 * `WIKI_BUILD_CHECK` for the build it starts, and stops when it finds it set): wired in the wrong mode it
 * fails at once instead of building for ever.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WIKI = 'docs/wiki';
const DIST = 'docs/wiki/site/.vitepress/dist';
/** This file is six folders under the repository root: docs/wiki/site/.vitepress/theme/shared. */
const ROOT = resolve(import.meta.dir, '..', '..', '..', '..', '..', '..');
/** The environment variable of a build started by this file, so that a docs build cannot start it again. */
const GUARD = 'WIKI_BUILD_CHECK';
const LOG_PATTERNS: [RegExp, string][] = [
  [/\bReferenceError\b/, 'a ReferenceError'],
  [/\b(TypeError|SyntaxError)\b/, 'a TypeError or SyntaxError'],
  [/is not defined/, '"is not defined"'],
  [/\[Vue warn\]/, 'a Vue warning'],
  [/hydration/i, 'a hydration message'],
];
/** Inner pages to look at, the first that was built: the wikis' own sections. */
const INNER_PAGES = ['references/index.html', 'guides/index.html', 'changelogs/index.html'];
const FOOTER = /class="[^"]*\bsite-footer\b/;
const BRAND = /class="[^"]*\bsite-brand\b/;
const VENIZIA_LINK = /class="[^"]*\bvenizia-link\b/;
/** Any class of the removed ecosystem switcher: eco, eco-btn, eco-pop, eco-logo--word, in any class list. */
const ECOSYSTEM_SWITCHER = /class="[^"]*\beco(-[\w-]+)?\b/;
const HERO = /<section\b[^>]*class="[^"]*\bhero\b[^>]*>[\s\S]*?<\/section>/;
const BUTTON = /<a\b[^>]*class="btn\b/g;
/** The arrow of the button, minified as `:after` or `::after`: a mask of the variable. */
const BUTTON_ARROW = /\.vh \.btn::?after\s*\{[^}]*var\(--arrow-ne\)/;
/** A `.btn` rule with its own `height: 40px` declaration, not `min-height` or `line-height`. */
const BUTTON_HEIGHT = /\.vh \.btn\s*\{(?:[^}]*;)?\s*height:\s*40px/;
/** The static dot pattern the dust replaced: a radial gradient of dots on a pixel grid. */
const DOT_PATTERN = /radial-gradient\(circle at [\d.]+px [\d.]+px/;

export class BuildCheck {
  /** What the build printed that a successful build must not print, one problem per offending line. */
  static scanLog(opts: { log: string }): string[] {
    const problems: string[] = [];

    for (const line of opts.log.split('\n')) {
      const hit = LOG_PATTERNS.find(([pattern]) => pattern.test(line));

      if (hit) {
        problems.push(`the build printed ${hit[1]}: ${line.trim().slice(0, 200)}`);
      }
    }

    return problems;
  }

  /**
   * What the server HTML of the home page must hold: the hero with its buttons, the footer, the dust canvases
   * of the hero and the footer, and the top bar.
   */
  static scanHome(opts: { html: string }): string[] {
    const problems: string[] = [];
    const canvases = opts.html.match(/<canvas\b/g)?.length ?? 0;
    const hero = HERO.exec(opts.html)?.[0];
    const buttons = hero?.match(BUTTON)?.length ?? 0;

    if (hero === undefined) {
      problems.push('the built home page has no hero section');
    } else if (buttons < 2) {
      problems.push(
        `the hero of the built home page has ${buttons} button link(s) (.btn), expected at least 2`,
      );
    }

    if (!FOOTER.test(opts.html)) {
      problems.push(
        'the built home page has no footer: a component threw while it was rendered on the server',
      );
    }

    if (canvases < 2) {
      problems.push(
        `the built home page has ${canvases} dust canvas(es), expected 2 (hero, footer)`,
      );
    }

    problems.push(...BuildCheck.scanBar({ html: opts.html, page: 'the built home page' }));

    return problems;
  }

  /** The top bar of a built page: the brand and the venizia.ai link, and no ecosystem switcher. */
  static scanBar(opts: { html: string; page: string }): string[] {
    const problems: string[] = [];

    if (!BRAND.test(opts.html)) {
      problems.push(
        `${opts.page} has no brand in the top bar (the Venizia wordmark and the docs name)`,
      );
    }

    if (!VENIZIA_LINK.test(opts.html)) {
      problems.push(`${opts.page} has no venizia.ai link in the top bar`);
    }

    if (ECOSYSTEM_SWITCHER.test(opts.html)) {
      problems.push(`${opts.page} still has the ecosystem switcher in the top bar`);
    }

    return problems;
  }

  /** An inner page has the top bar and no footer. */
  static scanInner(opts: { html: string; page: string }): string[] {
    const problems = BuildCheck.scanBar({
      html: opts.html,
      page: `the built inner page ${opts.page}`,
    });

    if (FOOTER.test(opts.html)) {
      problems.push(`the built inner page ${opts.page} has a footer; only the home page has one`);
    }

    return problems;
  }

  /**
   * What the built style sheets must hold: the arrow of the button (the `--arrow-ne` variable, masked by the
   * `::after` of `.btn`, and the 40 px button) and none of the static dot pattern the dust replaced.
   */
  static scanStyles(opts: { css: string }): string[] {
    const problems: string[] = [];

    if (!/--arrow-ne:\s*url\(/.test(opts.css)) {
      problems.push('the built style sheets do not define the button arrow (--arrow-ne)');
    }

    if (!BUTTON_ARROW.test(opts.css)) {
      problems.push(
        'the built style sheets have no .btn::after that masks the button arrow (var(--arrow-ne))',
      );
    }

    if (!BUTTON_HEIGHT.test(opts.css)) {
      problems.push('the built style sheets have no 40 px high .btn (the Figma button)');
    }

    if (DOT_PATTERN.test(opts.css)) {
      problems.push(
        'the built style sheets hold a static dot pattern (a radial-gradient of dots on a pixel grid)',
      );
    }

    return problems;
  }

  /** The text of every built style sheet. */
  static stylesOf(opts: { dist: string }): string {
    const assets = join(opts.dist, 'assets');

    return existsSync(assets)
      ? readdirSync(assets)
          .filter((file) => file.endsWith('.css'))
          .map((file) => readFileSync(join(assets, file), 'utf8'))
          .join('\n')
      : '';
  }

  /** The checks over a built site and the log of its build (empty when there is none); the problems, none when sound. */
  static check(opts: { dist: string; log: string }): string[] {
    const problems = BuildCheck.scanLog({ log: opts.log });
    const home = join(opts.dist, 'index.html');

    if (!existsSync(home)) {
      return [...problems, `no built home page at ${home}`];
    }

    problems.push(...BuildCheck.scanHome({ html: readFileSync(home, 'utf8') }));
    problems.push(...BuildCheck.scanStyles({ css: BuildCheck.stylesOf({ dist: opts.dist }) }));

    const inner = INNER_PAGES.find((page) => existsSync(join(opts.dist, page)));

    if (inner) {
      problems.push(
        ...BuildCheck.scanInner({
          html: readFileSync(join(opts.dist, inner), 'utf8'),
          page: inner,
        }),
      );
    } else {
      // not skipped: a renamed section or a broken build would otherwise pass without its inner pages looked at
      problems.push(`no built inner page to check (looked for ${INNER_PAGES.join(', ')})`);
    }

    return problems;
  }

  /**
   * Builds the wiki (when `build`), prints its output, then checks it; the exit code. Without a build, `logFile`
   * is the log of an earlier build to scan. A build started from inside a docs build is refused.
   */
  static run(opts: { root: string; build: boolean; logFile?: string }): number {
    let log = '';

    if (!opts.build && opts.logFile !== undefined) {
      if (!existsSync(opts.logFile)) {
        console.error(`wiki build: the log file ${opts.logFile} does not exist`);

        return 1;
      }

      log = readFileSync(opts.logFile, 'utf8');
    }

    if (opts.build) {
      if (process.env[GUARD] !== undefined) {
        console.error(
          'wiki build: started from inside a docs build, it would build again for ever; call it with --check (and --log <file>) after the build',
        );

        return 1;
      }

      const built = Bun.spawnSync(['bun', 'run', 'docs:build'], {
        cwd: join(opts.root, WIKI),
        env: { ...process.env, [GUARD]: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      log = `${built.stdout.toString()}${built.stderr.toString()}`;
      process.stdout.write(log);

      if (built.exitCode !== 0) {
        console.error(`wiki build: docs:build exited ${built.exitCode}`);

        return 1;
      }
    }

    const problems = BuildCheck.check({ dist: join(opts.root, DIST), log });

    for (const problem of problems) {
      console.error(`wiki build: ${problem}`);
    }

    if (problems.length === 0) {
      console.log(
        'wiki build: sound (the home page has its hero, footer, canvases and top bar; the button has its arrow; inner pages have no footer)',
      );
    }

    return problems.length === 0 ? 0 : 1;
  }
}

if (import.meta.main) {
  const logAt = process.argv.indexOf('--log');

  process.exit(
    BuildCheck.run({
      root: ROOT,
      build: !process.argv.includes('--check'),
      logFile: logAt === -1 ? undefined : process.argv[logAt + 1],
    }),
  );
}
