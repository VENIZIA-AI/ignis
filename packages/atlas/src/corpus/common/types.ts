import type { TCorpus } from '@/common';

/** One markdown file after its frontmatter has been split from the body. */
export interface IDocument {
  corpus: TCorpus;
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** One indexable section of a document - an H2/H3 chunk, or the intro text before the first one. */
export interface IChunk {
  id: string;
  corpus: TCorpus;
  document: string;
  anchor: string;
  headingPath: string;
  title: string;
  body: string;
  symbols: string;
  /** Frontmatter `title`, `description`, `type` and `tags`, space-joined; the same on every chunk of the document. */
  metadata: string;
  /** Multiplies into the `bm25` score - lower for a document kind that is trusted less as a primary source. */
  authority: number;
}

/** One directory to load into a corpus. `exclude` entries are relative-path prefixes to skip. */
export interface ICorpusRoot {
  corpus: TCorpus;
  directory: string;
  exclude?: string[];
}

/** A document `CorpusLoader` could not parse - its frontmatter was invalid YAML. */
export interface ISkippedDocument {
  corpus: TCorpus;
  path: string;
  error: string;
}
