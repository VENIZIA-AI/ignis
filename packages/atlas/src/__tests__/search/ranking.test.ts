import { Corpora } from '@/common';
import type { TCorpus } from '@/common';
import { Chunker } from '@/corpus';
import type { IDocument } from '@/corpus';
import { ChunkStore } from '@/search';
import { describe, expect, test } from 'bun:test';

// Pushes a section past the 200-character tiny-merge threshold without changing its topic.
const PAD =
  ' This sentence exists only to push the paragraph safely past the two-hundred character ' +
  'threshold used by the chunker before a section merges into the one that came before it.';

const buildDocument = (opts: {
  corpus: TCorpus;
  path: string;
  title: string;
  frontmatter?: Record<string, unknown>;
  body: string;
}): IDocument => ({
  corpus: opts.corpus,
  path: opts.path,
  title: opts.title,
  frontmatter: opts.frontmatter ?? {},
  body: opts.body,
});

// Nine small documents, each earning its place:
// - RELEASE_PLAYBOOK: `type: Playbook` in frontmatter, the word "playbook" never appears in the body.
// - REGISTERING_ARTIFACTS: an H3 ("Advanced options") whose own title and body never say
//   "register" or "artifacts" - only its heading path, prefixed with the document title, does.
// - LOG / CACHING_CONCEPT: the same term, "caching", four times in a history document and twice in
//   a canonical one - authority should outrank raw term frequency.
// - DENSE_WIDGETS / OTHER_WIDGET_1 / OTHER_WIDGET_2: one document with three matching sections,
//   two documents with one match each - five matches total, for the per-document cap.
// - GIZMO_GUIDE / GIZMO_REFERENCE: a document titled with the query word, whose own section is
//   unrelated (only the heading path, via the propagated title, matches), against a document
//   whose `symbols` carry the exact identifier - the metadata fix must not let the first outrank
//   the second (HEADING_PATH alone is 3.0, below SYMBOLS's 4.0).
const RELEASE_PLAYBOOK = buildDocument({
  corpus: Corpora.KNOWLEDGE,
  path: 'process/release-publish.md',
  title: 'Release and publish',
  frontmatter: {
    title: 'Release and publish',
    type: 'Playbook',
    description: 'How to run the release workflow.',
  },
  body: [
    '# Release and publish',
    '',
    'Run the workflow from the main branch. Dispatch it by hand, confirm the version bump, and ' +
      'wait for the run to finish before announcing anything downstream to the team.',
  ].join('\n'),
});

const REGISTERING_ARTIFACTS = buildDocument({
  corpus: Corpora.WIKI,
  path: 'guides/bootstrapping.md',
  title: 'Registering artifacts',
  body: [
    '# Registering artifacts',
    '',
    'This guide explains how to register artifacts so the container can resolve every binding ' +
      `before boot completes and traffic starts flowing through the whole application here.${PAD}`,
    '',
    '### Advanced options',
    '',
    'Configure the timeout and retry count before the first run completes, tuning batch size for ' +
      `large workloads without touching anything else in the pipeline configuration here.${PAD}`,
  ].join('\n'),
});

const LOG = buildDocument({
  corpus: Corpora.KNOWLEDGE,
  path: 'log.md',
  title: 'Log',
  body: [
    '# Log',
    '',
    '## 2026-01-01 - caching notes',
    '',
    'Caching came up again today. The caching layer needs caching invalidation rules, and the ' +
      `team agreed caching defaults should stay conservative until measured properly.${PAD}`,
  ].join('\n'),
});

const CACHING_CONCEPT = buildDocument({
  corpus: Corpora.KNOWLEDGE,
  path: 'architecture/caching.md',
  title: 'Caching',
  body: [
    '# Caching',
    '',
    '## Overview',
    '',
    'The caching layer sits in front of the database, giving every read a fast path before it ' +
      `ever reaches disk. A canonical description of the caching strategy lives here.${PAD}`,
  ].join('\n'),
});

const DENSE_WIDGETS = buildDocument({
  corpus: Corpora.WIKI,
  path: 'reference/dense.md',
  title: 'Reference guide',
  body: [
    '# Reference guide',
    '',
    '## Creating a widget',
    '',
    `Padding text about creating a widget.${PAD}`,
    '',
    '## Configuring a widget',
    '',
    `Padding text about configuring a widget.${PAD}`,
    '',
    '## Removing a widget',
    '',
    `Padding text about removing a widget.${PAD}`,
  ].join('\n'),
});

const OTHER_WIDGET_1 = buildDocument({
  corpus: Corpora.WIKI,
  path: 'guides/other-widget-1.md',
  title: 'Other guide one',
  body: [
    '# Other guide one',
    '',
    '## Section',
    '',
    `A different document that also mentions a widget once.${PAD}`,
  ].join('\n'),
});

const OTHER_WIDGET_2 = buildDocument({
  corpus: Corpora.WIKI,
  path: 'guides/other-widget-2.md',
  title: 'Other guide two',
  body: [
    '# Other guide two',
    '',
    '## Section',
    '',
    `Yet another document that also mentions a widget once.${PAD}`,
  ].join('\n'),
});

const GIZMO_GUIDE = buildDocument({
  corpus: Corpora.WIKI,
  path: 'guides/gizmo-assembly.md',
  title: 'Gizmo assembly guide',
  body: [
    '# Gizmo assembly guide',
    '',
    'Intro text long enough to clear the merge threshold, unrelated to the section below it in ' +
      `every way that matters here.${PAD}`,
    '',
    '## Safety notes',
    '',
    'Wear gloves and eye protection before starting any work here, and keep the workspace clear ' +
      `of clutter at all times.${PAD}`,
  ].join('\n'),
});

const GIZMO_REFERENCE = buildDocument({
  corpus: Corpora.WIKI,
  path: 'reference/other.md',
  title: 'Reference notes',
  body: [
    '# Reference notes',
    '',
    '## Usage',
    '',
    'Call `gizmo` once during setup to confirm the configuration resolved cleanly before anything ' +
      `else starts.${PAD}`,
  ].join('\n'),
});

const DOCUMENTS: IDocument[] = [
  RELEASE_PLAYBOOK,
  REGISTERING_ARTIFACTS,
  LOG,
  CACHING_CONCEPT,
  DENSE_WIDGETS,
  OTHER_WIDGET_1,
  OTHER_WIDGET_2,
  GIZMO_GUIDE,
  GIZMO_REFERENCE,
];

const buildStore = (): ChunkStore => {
  const chunker = Chunker.getInstance();
  const store = new ChunkStore();
  store.add({ chunks: DOCUMENTS.flatMap(document => chunker.chunk({ document })) });
  return store;
};

describe('ranking quality over a small fixture corpus', () => {
  const store = buildStore();

  test('frontmatter type: Playbook is searchable even though the body never says "playbook"', () => {
    const { hits } = store.search({ query: 'release playbook', limit: 3, offset: 0 });
    expect(hits.some(hit => hit.id.startsWith('okf:process/release-publish.md'))).toBe(true);
  });

  test('filler words rank a query the same as its content-only equivalent', () => {
    const withFiller = store.search({ query: 'how do I register artifacts', limit: 5, offset: 0 });
    const withoutFiller = store.search({ query: 'register artifacts', limit: 5, offset: 0 });
    expect(withFiller).toEqual(withoutFiller);
  });

  test('an H3 whose own title and body never say the query terms matches through its heading path', () => {
    const { hits } = store.search({ query: 'registering artifacts', limit: 10, offset: 0 });
    expect(hits.some(hit => hit.id === 'wiki:guides/bootstrapping.md#advanced-options')).toBe(true);
  });

  test('a history chunk mentioning a term four times ranks below a canonical chunk mentioning it twice', () => {
    const { hits } = store.search({ query: 'caching', limit: 10, offset: 0 });
    const historyRank = hits.findIndex(hit => hit.id.startsWith('okf:log.md'));
    const canonicalRank = hits.findIndex(hit => hit.id === 'okf:architecture/caching.md#overview');

    expect(historyRank).toBeGreaterThanOrEqual(0);
    expect(canonicalRank).toBeGreaterThanOrEqual(0);
    expect(historyRank).toBeGreaterThan(canonicalRank);
  });

  test('a document with three matching sections contributes at most two hits, and total reflects the diversified count', () => {
    const { hits, total } = store.search({ query: 'widget', limit: 5, offset: 0 });

    // Diversification runs before paging: the dense document's third section is dropped from the
    // ranked list outright, so of the 5 raw matches only 4 survive - `total` counts those 4.
    expect(total).toBe(4);
    expect(hits).toHaveLength(4);
    expect(hits.filter(hit => hit.id.startsWith('wiki:reference/dense.md#'))).toHaveLength(2);
  });

  test('a chunk whose only match is its document title, carried by the heading path, ranks below a genuine symbols match', () => {
    const { hits } = store.search({ query: 'gizmo', limit: 10, offset: 0 });
    const titleOnlyRank = hits.findIndex(
      hit => hit.id === 'wiki:guides/gizmo-assembly.md#safety-notes',
    );
    const symbolsRank = hits.findIndex(hit => hit.id === 'wiki:reference/other.md#usage');

    expect(titleOnlyRank).toBeGreaterThanOrEqual(0);
    expect(symbolsRank).toBeGreaterThanOrEqual(0);
    expect(symbolsRank).toBeLessThan(titleOnlyRank);
  });
});
