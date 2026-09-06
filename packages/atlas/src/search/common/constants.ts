/** `bm25()` per-column weights, plus the per-document cap on a returned page. */
export class RankingWeights {
  /** An FTS5 `UNINDEXED` column still needs a weight argument in `bm25()`'s positional list - it never matches, so the value is inert. */
  static readonly UNINDEXED = 0;
  static readonly TITLE = 5.0;
  static readonly HEADING_PATH = 3.0;
  static readonly BODY = 1.0;
  static readonly SYMBOLS = 4.0;
  static readonly METADATA = 3.0;
  static readonly MAX_HITS_PER_DOCUMENT = 2;
}

/** Multiplies into a chunk's `bm25` score, by how much a document's kind is trusted as a primary source. */
export class Authorities {
  static readonly CANONICAL = 1.0;
  static readonly CHANGELOG = 0.8;
  static readonly HISTORY = 0.5;
}

/** Query words dropped before planning, unless dropping all of them would leave no term at all. */
export class Stopwords {
  static readonly SCHEME_SET = new Set<string>([
    'how',
    'do',
    'does',
    'i',
    'the',
    'a',
    'an',
    'to',
    'of',
    'in',
    'is',
    'are',
    'what',
    'my',
    'we',
    'our',
    'with',
    'for',
    'on',
    'and',
    'or',
    'it',
    'this',
    'that',
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}
