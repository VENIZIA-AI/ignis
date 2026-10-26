/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * What a wiki hands the shared home layout and footer: its words and its links. The layout owns the
 * structure, the design and the behaviour; a wiki owns every sentence.
 */

/** One line of a terminal: a typed command, output, a verdict, a comment, or a gap between groups. */
export type TTermKind = 'cmd' | 'out' | 'ok' | 'warn' | 'bad' | 'c' | 'verdict' | 'gap';
export type TTermLine = [TTermKind, string];

/** A tab of the hero window: a code sample (highlighted) or a terminal scene (typed). */
export type THomeTab = {
  file: string;
  kind: 'code' | 'term';
  body: string | TTermLine[];
  /** A line under the window; trusted HTML (code, links). */
  note?: string;
};

export type THomeCell = {
  name: string;
  title: string;
  text: string;
  href?: string;
  chip?: [string, 'ok' | 'no' | ''];
};

export type THomeStep = { title: string; text: string; lines: TTermLine[] };

export type THomeContent = {
  id: string;
  name: string;
  version: string;
  eyebrow: string;
  /** The lines of the headline, then the coloured last line. */
  title: [string[], string];
  lede: string;
  /** Fine print under the lede, for a claim that has a limit. */
  ledeNote?: string;
  install: { label: string; lines: string[] };
  cta: [string, string][];
  tabs: THomeTab[];
  stats: [string, string][];
  footnote: string;
  featuresTitle: string;
  featuresLede: string;
  cells: THomeCell[];
  /** An extra section after the features; trusted HTML. */
  extraHtml?: string;
  stepsTitle?: string;
  steps?: THomeStep[];
  fitUse: string[];
  fitNot: string[];
  /** Trusted HTML. */
  maturityHtml: string;
  builtOn?: string[];
  closing: { title: string; text: string };
};

/** The identity of a wiki for the footer and the header. */
export type TSiteInfo = {
  id: string;
  name: string;
  repo: string;
  npm: string;
  /** The wiki's own links, the first footer column: label and path. */
  own: [string, string][];
};
