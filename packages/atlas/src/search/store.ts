import { AtlasConstants } from '@/common';
import type { TCorpus } from '@/common';
import type { IChunk } from '@/corpus';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import { Database } from 'bun:sqlite';
import { QueryPlanner } from './planner';
import { RankingWeights } from './common';
import type { IHit } from './common';

// SQLite treats a negative LIMIT as "no limit" - the AND and OR plans are fetched whole so paging
// can apply to their concatenation instead of to each plan separately.
const NO_LIMIT = -1;

const CREATE_TABLE_SQL = `
  CREATE VIRTUAL TABLE chunks USING fts5(
    id UNINDEXED, corpus UNINDEXED, document UNINDEXED, anchor UNINDEXED,
    heading_path, title, body, symbols, metadata, authority UNINDEXED,
    tokenize = 'porter unicode61'
  )
`;

const INSERT_SQL = `
  INSERT INTO chunks (id, corpus, document, anchor, heading_path, title, body, symbols, metadata, authority)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

// Column order matches CREATE_TABLE_SQL; the score itself is the bm25 result multiplied by the
// document's authority.
const SEARCH_SQL = `
  SELECT id, corpus, document, anchor, heading_path AS headingPath, title,
    bm25(chunks, ${RankingWeights.UNINDEXED}, ${RankingWeights.UNINDEXED}, ${RankingWeights.UNINDEXED}, ${RankingWeights.UNINDEXED}, ${RankingWeights.HEADING_PATH}, ${RankingWeights.TITLE}, ${RankingWeights.BODY}, ${RankingWeights.SYMBOLS}, ${RankingWeights.METADATA}, ${RankingWeights.UNINDEXED}) * authority AS score,
    snippet(chunks, 6, '[', ']', ' ... ', 12) AS snippet
  FROM chunks
  WHERE chunks MATCH ? AND (? IS NULL OR corpus = ?)
  ORDER BY score
  LIMIT ${NO_LIMIT}
`;

const SELECT_BY_ID_SQL = `
  SELECT id, corpus, document, anchor, heading_path AS headingPath, title, body, symbols, metadata, authority
  FROM chunks WHERE id = ?
`;

const SELECT_BY_DOCUMENT_SQL = `
  SELECT id, corpus, document, anchor, heading_path AS headingPath, title, body, symbols, metadata, authority
  FROM chunks WHERE document = ?
`;

type TInsertParams = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  number,
];
type TSearchParams = [string, string | null, string | null];
type TIdParams = [string];
type TDocumentParams = [string];

/** One `bm25`-ranked row before its snippet is capped. */
interface ISearchRow {
  id: string;
  corpus: TCorpus;
  document: string;
  anchor: string;
  headingPath: string;
  title: string;
  score: number;
  snippet: string;
}

/** Caps the raw FTS5 snippet to `SNIPPET_MAX_CHARS` - the hit's own `headingPath` field already carries that context, so the snippet does not repeat it. */
const snippetOf = (opts: { snippet: string }): string =>
  opts.snippet.length <= AtlasConstants.SNIPPET_MAX_CHARS
    ? opts.snippet
    : opts.snippet.slice(0, AtlasConstants.SNIPPET_MAX_CHARS);

const hitOf = (row: ISearchRow): IHit => ({
  id: row.id,
  corpus: row.corpus,
  title: row.title,
  headingPath: row.headingPath,
  anchor: row.anchor,
  score: row.score,
  snippet: snippetOf({ snippet: row.snippet }),
});

/** Keeps at most `maxPerDocument` rows per `document`, in order; a document's surplus rows are dropped. Applied before paging, so a later, different document can still fill the slot a dropped surplus row leaves behind. */
const diversify = (opts: { rows: ISearchRow[]; maxPerDocument: number }): ISearchRow[] => {
  const counts = new Map<string, number>();
  const kept: ISearchRow[] = [];

  for (const row of opts.rows) {
    const count = counts.get(row.document) ?? 0;
    if (count >= opts.maxPerDocument) {
      continue;
    }
    counts.set(row.document, count + 1);
    kept.push(row);
  }

  return kept;
};

/**
 * In-memory `bun:sqlite` FTS5 index over `IChunk`s: BM25 ranking weighted toward titles and
 * identifiers, scaled by each document's authority, AND-first search with an OR fallback, corpus
 * filtering, diversified so one document holds at most a few slots of the ranked list, then paged
 * by offset/limit. One instance owns one database - build a new one to reindex.
 */
export class ChunkStore extends BaseHelper {
  private readonly db: Database;
  private readonly planner = new QueryPlanner();

  constructor() {
    super({ scope: ChunkStore.name });
    this.db = new Database(':memory:');
    this.db.run(CREATE_TABLE_SQL);
  }

  add(opts: { chunks: IChunk[] }): void {
    const { chunks } = opts;
    if (chunks.length === 0) {
      return;
    }

    const insert = this.db.query<null, TInsertParams>(INSERT_SQL);
    const insertAll = this.db.transaction((rows: IChunk[]) => {
      for (const chunk of rows) {
        insert.run(
          chunk.id,
          chunk.corpus,
          chunk.document,
          chunk.anchor,
          chunk.headingPath,
          chunk.title,
          chunk.body,
          chunk.symbols,
          chunk.metadata,
          chunk.authority,
        );
      }
    });
    insertAll(chunks);

    this.logger.for('add').debug(`indexed chunks | count: ${chunks.length}`);
  }

  search(opts: { query: string; corpus?: TCorpus; limit: number; offset: number }): {
    total: number;
    hits: IHit[];
  } {
    const { query, limit, offset } = opts;
    const plan = this.planner.plan({ query });

    // An empty term list (e.g. a query that was only a `corpus:` filter) would MATCH '' - fts5
    // throws a syntax error on that, so there is nothing to search instead of a crash.
    if (plan.and.length === 0) {
      return { total: 0, hits: [] };
    }

    const corpus = opts.corpus ?? plan.corpus ?? null;
    const andRows = this.matchRows({ match: plan.and, corpus });

    // A single-term query has an identical AND and OR plan - the OR pass would only re-fetch rows
    // already in andRows, all filtered back out, so skip it instead of querying twice for nothing.
    const andIds = new Set(andRows.map(row => row.id));
    const orRows =
      plan.and === plan.or
        ? []
        : this.matchRows({ match: plan.or, corpus }).filter(row => !andIds.has(row.id));

    const combined = [...andRows, ...orRows];
    const diversified = diversify({
      rows: combined,
      maxPerDocument: RankingWeights.MAX_HITS_PER_DOCUMENT,
    });
    const hits = diversified.slice(offset, offset + limit).map(hitOf);

    this.logger
      .for('search')
      .debug(`query: ${query} | corpus: ${corpus ?? 'all'} | total: ${diversified.length}`);

    return { total: diversified.length, hits };
  }

  get(opts: { id: string }): IChunk | undefined {
    const row = this.db.query<IChunk, TIdParams>(SELECT_BY_ID_SQL).get(opts.id);
    return row ?? undefined;
  }

  list(opts: { document: string }): IChunk[] {
    return this.db.query<IChunk, TDocumentParams>(SELECT_BY_DOCUMENT_SQL).all(opts.document);
  }

  /** Closes the underlying database. Safe to call more than once; using the store after throws. */
  close(): void {
    this.db.close();
  }

  private matchRows(opts: { match: string; corpus: string | null }): ISearchRow[] {
    const { match, corpus } = opts;
    return this.db.query<ISearchRow, TSearchParams>(SEARCH_SQL).all(match, corpus, corpus);
  }
}
