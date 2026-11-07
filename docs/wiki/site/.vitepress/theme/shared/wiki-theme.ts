/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The colours of the wiki that come from the project's resolved theme: the neutral palette and the accent.
 * `vulcan sync` writes the resolved set into `.agents/vulcan.manifest.json` (`theme`); `config.mts` reads it
 * here and puts it in the head of every page as `:root` and `.dark` custom properties. Everything else the
 * wiki draws with (type, spacing, the code windows) stays in tokens.css.
 */
import { readFileSync } from 'node:fs';

/** The resolved colours of one mode, by token name (`ink`, `line`, `accent`, ...). */
export type TWikiThemeMode = Record<string, string>;

export interface IWikiTheme {
  light: TWikiThemeMode;
  dark: TWikiThemeMode;
}

export interface IWikiThemeOptions {
  theme: IWikiTheme;
  /** The second colour of the product gradient (`--accent-2`); the manifest has no token for it. */
  accent2?: string;
}

/** The wiki's variable, then the token that fills it in light and in dark. */
const VARIABLES: [string, string, string][] = [
  ['bg', 'bg', 'ground'],
  ['surface', 'bg', 'bg'],
  ['stroke', 'line', 'line'],
  ['stroke-strong', 'line-strong', 'line-strong'],
  ['text-title', 'ink', 'ink'],
  ['text-body', 'body', 'body'],
  ['text-muted', 'muted', 'muted'],
  ['accent', 'accent', 'accent'],
  ['accent-ink', 'accent-ink', 'accent-ink'],
  ['accent-text', 'accent-text', 'accent-text'],
];
/** How much of the accent the soft glow behind the hero mixes in, in light and in dark. */
const GLOW = { light: 13, dark: 16 };

export class WikiTheme {
  /** The `theme.tokens` of the manifest at `path`; a manifest without them is an error that says what to run. */
  static read(opts: { manifest: string }): IWikiTheme {
    const parsed = JSON.parse(readFileSync(opts.manifest, 'utf8')) as {
      theme?: { tokens?: IWikiTheme };
    };
    const tokens = parsed.theme?.tokens;

    if (tokens?.light === undefined || tokens.dark === undefined) {
      throw new Error(
        `${opts.manifest} has no theme: run \`vulcan sync\` with @venizia/vulcan 0.4.10-3 or later`,
      );
    }

    return tokens;
  }

  /** The `:root` and `.dark` blocks of the wiki's colours for `theme`. */
  static css(opts: IWikiThemeOptions): string {
    const declare = (mode: 'light' | 'dark'): string[] =>
      VARIABLES.map(([name, light, dark]) => {
        const value = opts.theme[mode][mode === 'light' ? light : dark];

        if (value === undefined) {
          throw new Error(
            `the theme has no ${mode === 'light' ? light : dark} token for --${name}`,
          );
        }

        return `--${name}:${value}`;
      });
    const onDark = opts.theme.dark.accent;
    const root = [
      ...declare('light'),
      ...(onDark === undefined ? [] : [`--accent-on-dark:${onDark}`]),
      ...(opts.accent2 === undefined ? [] : [`--accent-2:${opts.accent2}`]),
      `--glow:color-mix(in srgb, var(--accent) ${GLOW.light}%, transparent)`,
    ];
    const dark = [
      ...declare('dark'),
      `--glow:color-mix(in srgb, var(--accent) ${GLOW.dark}%, transparent)`,
    ];

    return `:root{${root.join(';')};}.dark{${dark.join(';')};}`;
  }

  /** The `<style>` entry for the `head` of the VitePress config (a `HeadConfig`, typed here so cli never reaches vitepress). */
  static head(opts: IWikiThemeOptions): ['style', Record<string, string>, string] {
    return ['style', {}, WikiTheme.css(opts)];
  }
}
