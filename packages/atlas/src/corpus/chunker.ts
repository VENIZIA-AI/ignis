import { Corpora } from '@/common';
import type { TCorpus } from '@/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { IChunk, IDocument } from './common';

const TINY_CHUNK_MAX_CHARS = 200;
const OVERSIZED_CHUNK_MAX_CHARS = 6000;

const HEADING_PATTERN = /^(#{2,3})\s+(.+?)\s*$/;
const FENCE_OPEN_PATTERN = /^(`{3,}|~{3,})/;
const CODE_SPAN_PATTERN = /`([^`\n]+)`/g;
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_.]*/g;
const CAMEL_BOUNDARY_PATTERN = /(?<=[a-z0-9])(?=[A-Z])/;

/** One section of a document before anchors, ids and oversized-splitting are applied. */
interface IRawSection {
  level: 0 | 2 | 3;
  title: string;
  headingPath: string;
  body: string;
}

/** Tracks whether the current line sits inside a ``` or ~~~ fence - a heading marker inside one is text. */
class FenceTracker {
  private char = '';
  private length = 0;

  consume(line: string): boolean {
    const trimmed = line.trim();

    if (this.length === 0) {
      const opened = trimmed.match(FENCE_OPEN_PATTERN);
      if (!opened) {
        return false;
      }
      this.char = opened[1].charAt(0);
      this.length = opened[1].length;
      return true;
    }

    if (trimmed.length >= this.length && [...trimmed].every(char => char === this.char)) {
      this.length = 0;
      this.char = '';
    }
    return true;
  }
}

/** GitHub-style anchor slug: lower-case, strip punctuation, spaces become hyphens. */
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

/** Walks the body tracking fences and heading levels, merging a section under 200 chars into the one before it. */
const splitIntoSections = (opts: { document: IDocument }): IRawSection[] => {
  const { document } = opts;
  const sections: IRawSection[] = [];
  const fence = new FenceTracker();

  let level: 0 | 2 | 3 = 0;
  let title = document.title;
  let headingPath = document.title;
  let currentH2 = '';
  let buffer: string[] = [];

  const closeCurrent = (): void => {
    const body = buffer.join('\n').trim();
    buffer = [];

    if (level === 0) {
      if (body.length > 0) {
        sections.push({ level, title, headingPath, body });
      }
      return;
    }

    const previous = sections[sections.length - 1];
    if (body.length < TINY_CHUNK_MAX_CHARS && previous) {
      previous.body = `${previous.body}\n\n${body}`.trim();
      return;
    }

    if (level === 2) {
      currentH2 = title;
    }
    sections.push({ level, title, headingPath, body });
  };

  for (const line of document.body.split('\n')) {
    const inFence = fence.consume(line);
    const heading = inFence ? null : line.match(HEADING_PATTERN);

    if (!heading) {
      buffer.push(line);
      continue;
    }

    closeCurrent();

    level = heading[1].length === 2 ? 2 : 3;
    title = heading[2];
    headingPath = level === 3 && currentH2 ? `${currentH2} > ${title}` : title;
  }

  closeCurrent();

  return sections;
};

/** GitHub anchors for the final (post-merge) sections, in document order; repeats get `-1`, `-2`. */
const anchorsOf = (opts: { sections: IRawSection[] }): string[] => {
  const seen = new Map<string, number>();

  return opts.sections.map(section => {
    if (section.level === 0) {
      return '';
    }

    const base = slugify(section.title);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  });
};

/** Packs paragraphs (blank-line separated) into parts no larger than 6000 chars, never splitting one. */
const splitOversized = (opts: { body: string }): string[] => {
  const paragraphs = opts.body.split(/\n{2,}/);
  const parts: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && candidate.length > OVERSIZED_CHUNK_MAX_CHARS) {
      parts.push(current);
      current = paragraph;
      continue;
    }
    current = candidate;
  }

  if (current) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [opts.body];
};

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

/** A whitespace-delimited word that is a URL, not an identifier: `://` anywhere, or a leading `http`. */
const isUrlShaped = (word: string): boolean => word.includes('://') || word.startsWith('http');

/** Every `[A-Za-z_][A-Za-z0-9_.]*` token in `text`, split on `.` into its dotted segments; a URL-shaped word contributes nothing. */
const identifiersOf = (text: string): string[] => {
  const tokens: string[] = [];
  const words = text.split(/\s+/).filter(word => !isUrlShaped(word));
  const matches = words.join(' ').match(IDENTIFIER_PATTERN) ?? [];
  for (const match of matches) {
    for (const segment of match.split('.')) {
      if (segment) {
        tokens.push(segment);
      }
    }
  }
  return tokens;
};

/**
 * Identifiers from a chunk's code spans and fenced code: raw dotted segments first, then their
 * camelCase-split, lower-cased pieces (`bootChecks` also indexes `boot checks`), de-duplicated.
 * A fence's own opening line (the delimiter plus its info string, e.g. `` ```typescript ``) is
 * skipped - the language tag is not a code identifier.
 */
const symbolsOf = (opts: { body: string }): string => {
  const fence = new FenceTracker();
  const rawTokens: string[] = [];
  let wasFenced = false;

  for (const line of opts.body.split('\n')) {
    const inFence = fence.consume(line);
    const isFenceOpenLine = inFence && !wasFenced;
    wasFenced = inFence;

    if (inFence) {
      if (!isFenceOpenLine) {
        rawTokens.push(...identifiersOf(line));
      }
      continue;
    }

    const spans = line.match(CODE_SPAN_PATTERN) ?? [];
    for (const span of spans) {
      rawTokens.push(...identifiersOf(span.slice(1, -1)));
    }
  }

  const expanded = rawTokens.flatMap(token =>
    token.split(CAMEL_BOUNDARY_PATTERN).map(piece => piece.toLowerCase()),
  );

  return dedupe([...rawTokens, ...expanded]).join(' ');
};

const citationPrefixOf = (corpus: TCorpus): string => {
  switch (corpus) {
    case Corpora.WIKI: {
      return 'wiki';
    }
    case Corpora.CHANGELOG: {
      return 'changelog';
    }
    case Corpora.KNOWLEDGE: {
      return 'okf';
    }
    default: {
      throw getError({ message: `[citationPrefixOf] unknown corpus | corpus: ${corpus}` });
    }
  }
};

/** Changelogs cite by file stem (`2026-01-01-thing`); wiki and knowledge cite by their full path. */
const citationDocumentOf = (opts: { corpus: TCorpus; path: string }): string =>
  opts.corpus === Corpora.CHANGELOG ? opts.path.replace(/\.md$/, '') : opts.path;

const buildId = (opts: { corpus: TCorpus; path: string; anchor: string }): string =>
  `${citationPrefixOf(opts.corpus)}:${citationDocumentOf(opts)}#${opts.anchor}`;

/** Splits a document into H2/H3 sections: never inside a fence, tiny siblings merged, oversized ones paged. */
export class Chunker extends BaseHelper {
  private static instance?: Chunker;

  private constructor() {
    super({ scope: Chunker.name });
  }

  static getInstance(): Chunker {
    return (this.instance ??= new Chunker());
  }

  chunk(opts: { document: IDocument }): IChunk[] {
    const { document } = opts;
    const sections = splitIntoSections({ document });
    const anchors = anchorsOf({ sections });

    const chunks: IChunk[] = [];
    sections.forEach((section, index) => {
      const baseAnchor = anchors[index];
      const parts = splitOversized({ body: section.body });
      if (parts.length > 1) {
        this.logger
          .for('chunk')
          .debug(`split an oversized section | anchor: ${baseAnchor} | parts: ${parts.length}`);
      }

      parts.forEach((body, partIndex) => {
        const anchor = partIndex === 0 ? baseAnchor : `${baseAnchor}-part${partIndex + 1}`;
        chunks.push({
          id: buildId({ corpus: document.corpus, path: document.path, anchor }),
          corpus: document.corpus,
          document: document.path,
          anchor,
          headingPath: section.headingPath,
          title: section.title,
          body,
          symbols: symbolsOf({ body }),
        });
      });
    });

    return chunks;
  }
}
