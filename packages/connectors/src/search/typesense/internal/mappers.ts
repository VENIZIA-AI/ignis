import { RecordUtility } from '@/common/internal';
import type { ISearchResult } from '@/search/core';
import type { ISynonym } from '@/search/core/models';
import { TypesensePayloadReader } from './guards';

export class TypesenseMapper {
  /** Maps a raw Typesense search hit (snake_case `text_match`) onto the camelCase `ISearchResult` hit shape; read via bracket string access so no snake_case identifier is declared here. */
  static mapSearchHit<TDocument extends object>(opts: {
    hit: unknown;
  }): {
    document: TDocument;
    highlight?: unknown;
    highlights?: unknown[];
    score?: number;
  } {
    const { hit } = opts;

    if (!RecordUtility.isRecord(hit)) {
      return { document: {} as TDocument };
    }

    const mapped: {
      document: TDocument;
      highlight?: unknown;
      highlights?: unknown[];
      score?: number;
    } = {
      document: hit['document'] as TDocument,
    };

    if (hit['highlight'] !== undefined) {
      mapped.highlight = hit['highlight'];
    }

    if (Array.isArray(hit['highlights'])) {
      mapped.highlights = hit['highlights'];
    }

    if (typeof hit['text_match'] === 'number') {
      mapped.score = hit['text_match'];
    }

    return mapped;
  }

  /** Maps a raw Typesense search response onto the camelCase `ISearchResult`; snake_case wire fields (`out_of`/`search_time_ms`/`facet_counts`/`grouped_hits`) are read only via bracket string access, never as identifiers, and absent fields are omitted rather than mapped as `undefined`. */
  static mapSearchResult<TDocument extends object>(opts: {
    raw: unknown;
  }): ISearchResult<TDocument> {
    const { raw } = opts;

    if (!RecordUtility.isRecord(raw)) {
      return { found: 0, isFoundExact: true };
    }

    // `found` is exhaustive UNLESS the engine ran out of its search-time budget: `search_cutoff`
    // means it stopped early and reported what it had, so the count is an estimate. Hardcoding
    // `true` told every caller that a truncated count was authoritative.
    const result: ISearchResult<TDocument> = {
      found: TypesensePayloadReader.readNumberField({ value: raw, key: 'found' }),
      isFoundExact: raw['search_cutoff'] !== true,
    };

    if (typeof raw['out_of'] === 'number') {
      result.outOf = raw['out_of'];
    }
    if (typeof raw['search_time_ms'] === 'number') {
      result.searchTimeMs = raw['search_time_ms'];
    }
    if (Array.isArray(raw['facet_counts'])) {
      result.facetCounts = raw['facet_counts'];
    }
    if (Array.isArray(raw['grouped_hits'])) {
      result.groupedHits = raw['grouped_hits'];
    }
    if (Array.isArray(raw['hits'])) {
      result.hits = raw['hits'].map((hit) => TypesenseMapper.mapSearchHit<TDocument>({ hit }));
    }

    return result;
  }

  static toSynonym(opts: { value: { id: string; synonyms: string[]; root?: string } }): ISynonym {
    const { id, synonyms, root } = opts.value;
    // Multi-way sets come back with root: "" - treat empty/absent alike so only one-way keeps a root.
    return root ? { id, synonyms, root } : { id, synonyms };
  }
}

// Typesense's wire shape for a synonym set; `root` is only present for one-way synonyms.
export const isSynonymResponse = (
  value: unknown,
): value is { id: string; synonyms: string[]; root?: string } => {
  return (
    RecordUtility.isRecord(value) && typeof value.id === 'string' && Array.isArray(value.synonyms)
  );
};
