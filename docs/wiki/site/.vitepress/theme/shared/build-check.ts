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
 *     `.btn`), hold the static dot pattern that the dust replaced, or lack what keeps the page from
 *     scrolling sideways at 320 px (the body without the default 320 px minimum width, the brand name
 *     hidden below 400 px);
 *   - a built inner page has a footer (inner pages have none) or lacks the top bar;
 *   - a version folder of the changelog is not served at `/changelogs/<X.Y.Z>`, its page did not render the details
 *     component, a folder with a migration block has no upgrade page at `/changelogs/<X.Y.Z>/upgrade` or that page did not
 *     render, or an item of a version page is in the script every page loads (`chunks/theme.*.js`: the two pages mount
 *     their components as async components);
 *   - the built changelog index has no `class="cl"` root: the page did not render `ChangelogIndex`.
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
import { guidesFromFiles } from './changelog-guides';
import { parseItems } from './changelog-items';

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
/** The root element of the changelog index component. */
const INDEX_ROOT = /class="cl"/;
/** The root of the details page and of the upgrade page of a version. */
const DETAIL_ROOT = /class="cx-detail"/;
/** A version folder of the changelog: `changelogs/<X.Y.Z>/log.md`. */
const VERSION_FOLDER = /^\d+\.\d+\.\d+$/;
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
/** The body without the default theme's `min-width: 320px`: a 320 px window with a classic scrollbar scrolls sideways with it. */
const BODY_NO_MINIMUM = /html body\s*\{[^}]*min-width:\s*0/;
/** Below 400 px the brand's name and divider give way to the search and menu buttons. */
const NARROW_BRAND = /max-width:\s*399px\)\s*\{[^}]*\.brand-name[^}]*display:\s*none/;
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

    if (!BODY_NO_MINIMUM.test(opts.css)) {
      problems.push(
        'the built style sheets keep the body at least 320 px wide (no `html body { min-width: 0 }`)',
      );
    }

    if (!NARROW_BRAND.test(opts.css)) {
      problems.push('the built style sheets do not hide the brand name below 400 px');
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

  /**
   * Every version folder of the changelog is served at `/changelogs/<X.Y.Z>`, which is where the index and the feed link to it:
   * a wiki serves `changelogs/<X.Y.Z>/log.md` there through `rewrites: { 'changelogs/:version/log.md': 'changelogs/:version.md' }`
   * in its VitePress config. Without that line the links 404. The page must also have rendered the details component: the
   * config's `transformPageData` (`changelogPageData`) lays the page out so SiteLayout can mount it.
   */
  static scanVersionPages(opts: { changelogs: string; dist: string }): string[] {
    if (!existsSync(opts.changelogs)) {
      return [];
    }

    return readdirSync(opts.changelogs)
      .filter(
        (name) => VERSION_FOLDER.test(name) && existsSync(join(opts.changelogs, name, 'log.md')),
      )
      .flatMap((name) => {
        const page = join(opts.dist, 'changelogs', `${name}.html`);

        if (!existsSync(page)) {
          return [
            `the version folder changelogs/${name} is not served at /changelogs/${name}: add rewrites: { 'changelogs/:version/log.md': 'changelogs/:version.md' } to the VitePress config`,
          ];
        }

        return DETAIL_ROOT.test(readFileSync(page, 'utf8'))
          ? []
          : [
              `the built /changelogs/${name} did not render the details of the version: add transformPageData: (pageData) => changelogPageData({ pageData }) to the VitePress config`,
            ];
      });
  }

  /**
   * A version folder whose `migration.yaml` holds a block has an upgrade page at `/changelogs/<X.Y.Z>/upgrade`: the dynamic route
   * `changelogs/upgrade/[version].md` with its `[version].paths.ts`, and `rewrites: { 'changelogs/upgrade/:version.md':
   * 'changelogs/:version/upgrade.md' }` in the VitePress config.
   */
  static scanUpgradePages(opts: { changelogs: string; dist: string }): string[] {
    if (!existsSync(opts.changelogs)) {
      return [];
    }

    const files = readdirSync(opts.changelogs)
      .filter((name) => VERSION_FOLDER.test(name))
      .map((name) => join(opts.changelogs, name, 'migration.yaml'))
      .filter((file) => existsSync(file));

    return guidesFromFiles({ files }).flatMap(({ version }) => {
      const page = join(opts.dist, 'changelogs', version, 'upgrade.html');

      if (!existsSync(page)) {
        return [
          `the version folder changelogs/${version} has migration blocks but no page at /changelogs/${version}/upgrade: add changelogs/upgrade/[version].md and [version].paths.ts, and rewrites: { 'changelogs/upgrade/:version.md': 'changelogs/:version/upgrade.md' } to the VitePress config`,
        ];
      }

      return DETAIL_ROOT.test(readFileSync(page, 'utf8'))
        ? []
        : [
            `the built /changelogs/${version}/upgrade did not render the upgrade guide: add transformPageData: (pageData) => changelogPageData({ pageData }) to the VitePress config`,
          ];
    });
  }

  /**
   * The index page mounts `ChangelogIndex` with a local import in a `<script setup>`. A wiki that copies the theme and misses that
   * import builds an empty page, and the build still exits 0: the built index must hold the component's root.
   */
  static scanChangelogIndex(opts: { dist: string }): string[] {
    const index = join(opts.dist, 'changelogs', 'index.html');

    return existsSync(index) && !INDEX_ROOT.test(readFileSync(index, 'utf8'))
      ? [
          'the built changelogs/index.html did not render the changelog index: mount ChangelogIndex with a local import in changelogs/index.md',
        ]
      : [];
  }

  /**
   * The details page and the upgrade page of a version mount async components, so the items of the logs are in chunks of their
   * own. Mounted as plain components they land in the theme chunk, which every page of the wiki loads. The id of an item is in
   * no other data of the theme: finding one there means the text of a page reached that script.
   */
  static scanThemeChunk(opts: { changelogs: string; dist: string }): string[] {
    const chunks = join(opts.dist, 'assets', 'chunks');

    if (!existsSync(opts.changelogs) || !existsSync(chunks)) {
      return [];
    }

    const theme = readdirSync(chunks)
      .filter((file) => /^theme\..*\.js$/.test(file))
      .map((file) => readFileSync(join(chunks, file), 'utf8'))
      .join('\n');

    return readdirSync(opts.changelogs)
      .filter(
        (name) => VERSION_FOLDER.test(name) && existsSync(join(opts.changelogs, name, 'log.md')),
      )
      .flatMap((name) => {
        const item = parseItems({
          src: readFileSync(join(opts.changelogs, name, 'log.md'), 'utf8'),
        }).find((entry) => theme.includes(`"${entry.id}"`));

        return item === undefined
          ? []
          : [
              `the item "${item.id}" of the version page changelogs/${name} is in the script every page loads (assets/chunks/theme.*.js): SiteLayout must mount ChangelogVersion and ChangelogUpgrade as async components`,
            ];
      });
  }

  /** The checks over a built site and the log of its build (empty when there is none); the problems, none when sound. */
  static check(opts: { dist: string; log: string; changelogs?: string }): string[] {
    const problems = BuildCheck.scanLog({ log: opts.log });
    const home = join(opts.dist, 'index.html');

    if (!existsSync(home)) {
      return [...problems, `no built home page at ${home}`];
    }

    problems.push(...BuildCheck.scanHome({ html: readFileSync(home, 'utf8') }));
    problems.push(...BuildCheck.scanStyles({ css: BuildCheck.stylesOf({ dist: opts.dist }) }));

    if (opts.changelogs !== undefined) {
      problems.push(
        ...BuildCheck.scanVersionPages({ changelogs: opts.changelogs, dist: opts.dist }),
        ...BuildCheck.scanUpgradePages({ changelogs: opts.changelogs, dist: opts.dist }),
        ...BuildCheck.scanThemeChunk({ changelogs: opts.changelogs, dist: opts.dist }),
        ...BuildCheck.scanChangelogIndex({ dist: opts.dist }),
      );
    }

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

    const problems = BuildCheck.check({
      dist: join(opts.root, DIST),
      log,
      changelogs: join(opts.root, WIKI, 'content', 'changelogs'),
    });

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
