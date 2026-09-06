import { Corpora } from '@/common';
import type { TCorpus } from '@/common';
import { Chunker, parseFrontmatter } from '@/corpus';
import type { IDocument } from '@/corpus';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

// __dirname, not import.meta: this package emits CommonJS.
const FIXTURES_ROOT = join(__dirname, '../fixtures/corpus');

const readFixtureDocument = (opts: {
  corpus: TCorpus;
  directory: string;
  file: string;
}): IDocument => {
  const text = readFileSync(join(opts.directory, opts.file), 'utf8');
  const { data, body } = parseFrontmatter({ text, path: opts.file });
  const title = typeof data.title === 'string' ? data.title : opts.file;

  return { corpus: opts.corpus, path: opts.file, title, frontmatter: data, body };
};

const buildDocument = (opts: {
  corpus?: TCorpus;
  path?: string;
  title?: string;
  body: string;
}): IDocument => ({
  corpus: opts.corpus ?? Corpora.WIKI,
  path: opts.path ?? 'doc.md',
  title: opts.title ?? 'Doc',
  frontmatter: {},
  body: opts.body,
});

describe('Chunker - guide.md fixture (fence, tiny merge, heading path, anchors)', () => {
  const document = readFixtureDocument({
    corpus: Corpora.WIKI,
    directory: join(FIXTURES_ROOT, 'wiki'),
    file: 'guide.md',
  });
  const chunks = Chunker.getInstance().chunk({ document });

  test('produces exactly four chunks: intro, two H2 sections and one H3 - the tiny H2 merges away', () => {
    expect(chunks).toHaveLength(4);
  });

  test('the intro chunk carries the document title, an empty anchor, and its own id', () => {
    expect(chunks[0]).toMatchObject({
      corpus: Corpora.WIKI,
      document: 'guide.md',
      anchor: '',
      headingPath: 'Artifact registration guide',
      title: 'Artifact registration guide',
      id: 'wiki:guide.md#',
    });
    expect(chunks[0].body.startsWith('# Artifact registration guide')).toBe(true);
  });

  test('a fence line that looks like a heading is not treated as one, and its text survives as body', () => {
    const registering = chunks[1];
    expect(registering.title).toBe('Registering artifacts');
    expect(registering.anchor).toBe('registering-artifacts');
    expect(registering.id).toBe('wiki:guide.md#registering-artifacts');
    expect(registering.body).toContain('## not a heading');
    expect(chunks.some(chunk => chunk.title === 'not a heading')).toBe(false);
  });

  test('an H3 under an H2 gets a heading path joining both, and its own anchor', () => {
    const resolving = chunks[3];
    expect(resolving.title).toBe('Resolving bindings');
    expect(resolving.headingPath).toBe('Symbols and lookups > Resolving bindings');
    expect(resolving.anchor).toBe('resolving-bindings');
    expect(resolving.id).toBe('wiki:guide.md#resolving-bindings');
  });

  test('the trailing one-line H2 merges into the previous chunk instead of becoming its own', () => {
    expect(chunks.some(chunk => chunk.title === 'See also')).toBe(false);
    expect(chunks[3].body).toContain('See the index.');
  });

  test('the second H2 section on its own has no parent in its heading path', () => {
    const symbolsSection = chunks[2];
    expect(symbolsSection.title).toBe('Symbols and lookups');
    expect(symbolsSection.headingPath).toBe('Symbols and lookups');
    expect(symbolsSection.anchor).toBe('symbols-and-lookups');
  });
});

describe('Chunker - symbols from code spans', () => {
  test('camelCase-splits a dotted identifier, keeping the raw segments and their split pieces', () => {
    const document = buildDocument({
      body: '## Lookups\n\nResolve it via `bootChecks.binding` before boot completes, past the tiny threshold.',
    });

    const [chunk] = Chunker.getInstance().chunk({ document });
    expect(chunk.symbols).toBe('bootChecks binding boot checks');
  });

  test('the same code span inside the real guide.md fixture produces the same symbols', () => {
    const document = readFixtureDocument({
      corpus: Corpora.WIKI,
      directory: join(FIXTURES_ROOT, 'wiki'),
      file: 'guide.md',
    });
    const chunks = Chunker.getInstance().chunk({ document });
    const symbolsSection = chunks.find(chunk => chunk.title === 'Symbols and lookups');

    expect(symbolsSection?.symbols).toBe('bootChecks binding boot checks');
  });

  test('identifiers inside a fenced block count too, plain prose does not', () => {
    const document = buildDocument({
      body: [
        '## Fenced',
        '',
        '```ts',
        'const fooBar = getBaz();',
        '```',
        '',
        'This sentence has no code spans, so none of these prose words should appear as symbols.',
      ].join('\n'),
    });

    const [chunk] = Chunker.getInstance().chunk({ document });
    expect(chunk.symbols).toContain('fooBar');
    expect(chunk.symbols).toContain('foo');
    expect(chunk.symbols).toContain('bar');
    expect(chunk.symbols).toContain('getBaz');
    expect(chunk.symbols).not.toContain('sentence');
  });
});

describe('Chunker - citation ids per corpus', () => {
  const anchoredBody =
    '## Anchor\n\nJust enough text to keep this section out of the tiny-merge threshold, comfortably ' +
    'past two hundred characters so it survives as its own chunk without being folded into anything ' +
    'that came before it in the document.';

  test('wiki cites by its file path', () => {
    const [chunk] = Chunker.getInstance().chunk({
      document: buildDocument({ corpus: Corpora.WIKI, path: 'guide.md', body: anchoredBody }),
    });
    expect(chunk.id).toBe('wiki:guide.md#anchor');
  });

  test('knowledge cites as okf, by its file path', () => {
    const [chunk] = Chunker.getInstance().chunk({
      document: buildDocument({
        corpus: Corpora.KNOWLEDGE,
        path: 'concept.md',
        body: anchoredBody,
      }),
    });
    expect(chunk.id).toBe('okf:concept.md#anchor');
  });

  test('changelog cites by its file stem, dropping the .md extension', () => {
    const [chunk] = Chunker.getInstance().chunk({
      document: buildDocument({
        corpus: Corpora.CHANGELOG,
        path: '2026-01-01-thing.md',
        body: anchoredBody,
      }),
    });
    expect(chunk.id).toBe('changelog:2026-01-01-thing#anchor');
    // `document` stays the real file name; only the citation `id` drops the extension.
    expect(chunk.document).toBe('2026-01-01-thing.md');
  });
});

describe('Chunker - duplicate anchors', () => {
  test('repeated heading text gets -1, -2 suffixes in order', () => {
    const body = [
      '## Notes',
      '',
      'First occurrence of a repeated heading. The body has to run past two hundred characters so this section survives on its own instead of being folded into whatever chunk came directly before it in the walk.',
      '',
      '## Notes',
      '',
      'Second occurrence of the exact same heading text. This body also runs past two hundred characters for the same reason the first one does, so the de-duplication counter has something real to count here.',
      '',
      '## Notes',
      '',
      'Third occurrence of the exact same heading text again. This body, too, runs past two hundred characters, long enough that the merge step leaves it standing as its own chunk in the final list produced here.',
    ].join('\n');

    const chunks = Chunker.getInstance().chunk({ document: buildDocument({ body }) });
    const notes = chunks.filter(chunk => chunk.title === 'Notes');

    expect(notes.map(chunk => chunk.anchor)).toEqual(['notes', 'notes-1', 'notes-2']);
    expect(notes.map(chunk => chunk.id)).toEqual([
      'wiki:doc.md#notes',
      'wiki:doc.md#notes-1',
      'wiki:doc.md#notes-2',
    ]);
  });
});

describe('Chunker - oversized sections split at paragraph boundaries', () => {
  test('a section over 6000 characters splits into -part2, -part3 chunks that repeat the heading path', () => {
    const sentence =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.';
    const paragraphs = Array.from({ length: 100 }, (_, index) => `${sentence} Marker ${index}.`);
    const body = `## Big section\n\n${paragraphs.join('\n\n')}`;

    const chunks = Chunker.getInstance().chunk({ document: buildDocument({ body }) });

    // The body starts at the H2 - no intro text - so every chunk belongs to "Big section".
    const parts = chunks.filter(chunk => chunk.title === 'Big section');
    expect(parts).toEqual(chunks);
    expect(parts.length).toBeGreaterThan(1);

    parts.forEach((part, index) => {
      expect(part.headingPath).toBe('Big section');
      expect(part.title).toBe('Big section');
      expect(part.body.length).toBeLessThanOrEqual(6000);
      expect(part.anchor).toBe(index === 0 ? 'big-section' : `big-section-part${index + 1}`);
      expect(part.id).toBe(`wiki:doc.md#${part.anchor}`);
    });

    for (let index = 0; index < paragraphs.length; index += 1) {
      const marker = `Marker ${index}.`;
      const occurrences = parts.filter(part => part.body.includes(marker)).length;
      expect(occurrences).toBe(1);
    }
  });
});
