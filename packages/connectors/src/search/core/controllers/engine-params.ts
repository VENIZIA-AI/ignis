import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { TMultiSearchInput, TSearchInput } from '@/search/core/repositories/common';

/** A name as it is compared: lower-case letters and digits only, so `filter_by`, `filterBy` and `FILTER_BY` are one name. */
const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * What a search request's `engineParams` may carry. `engineParams` hands the engine its own wire parameters, and some of
 * them choose the rows (`filter_by`), the fields (`include_fields`, `query_by`, `facet_by`, `highlight_fields`) or both
 * (a preset). Over the wire it is refused on every search controller, scoped or not, unless the controller names the
 * parameters a caller may send (`engineParams.allow`). A parameter that selects rows or fields, or reorders them, can
 * never be named. Server code passes `engineParams` on the repository call as before.
 */
export class SearchEngineParams {
  /**
   * Parameters no allowlist can hold, in the form `normalize` gives: they choose rows, fields or order, in either engine.
   * `preset` and `override_tags` / `pinned_hits` / `hidden_hits` change which rows come back, and `vector_query` /
   * `vector` / `hybrid` search by similarity, which reveals a field's content as surely as a filter does.
   */
  static readonly NEVER_ALLOWED: ReadonlySet<string> = new Set(
    [
      'filter_by',
      'filter',
      'include_fields',
      'exclude_fields',
      'query_by',
      'query_by_weights',
      'facet_by',
      'facets',
      'facet_query',
      'group_by',
      'highlight_fields',
      'highlight_full_fields',
      'highlight_affix_num_tokens',
      'sort_by',
      'sort',
      'preset',
      'override_tags',
      'pinned_hits',
      'hidden_hits',
      'filter_curated_hits',
      'vector_query',
      'vector',
      'hybrid',
      'embedder',
      'attributes_to_retrieve',
      'attributes_to_search_on',
      'attributes_to_highlight',
      'attributes_to_crop',
      'distinct',
      'collection',
      'index_uid',
      'indexuid',
      'federation',
      'queries',
      'searches',
    ].map(normalize),
  );

  /** The allowlist of a controller, validated: strings only, none that selects rows or fields. Throws at definition time, so a bad list never boots. */
  static resolveAllowlist(opts: { scope: string; allow?: unknown }): ReadonlySet<string> {
    const { scope, allow } = opts;

    if (allow === undefined) {
      return new Set();
    }

    if (!Array.isArray(allow)) {
      throw getError({
        message: `[${scope}] engineParams.allow must be a list of engine parameter names`,
      });
    }

    const resolved = new Set<string>();

    for (const name of allow) {
      if (typeof name !== 'string' || normalize(name).length === 0) {
        throw getError({
          message: `[${scope}] engineParams.allow holds ${JSON.stringify(name)} | list engine parameter names, for example 'typo_tokens_threshold'`,
        });
      }

      if (SearchEngineParams.NEVER_ALLOWED.has(normalize(name))) {
        throw getError({
          message: `[${scope}] engineParams.allow holds ${JSON.stringify(name)} | a parameter that selects rows or fields, or orders them, can never be allowed`,
        });
      }

      resolved.add(normalize(name));
    }

    return resolved;
  }

  /** Refuses (400) an `engineParams` that carries a name the controller does not allow. With no allowlist, any `engineParams` is refused. */
  static assertAllowed(opts: { engineParams?: unknown; allowed: ReadonlySet<string> }): void {
    const { engineParams, allowed } = opts;

    if (engineParams === undefined || engineParams === null) {
      return;
    }

    if (typeof engineParams !== 'object' || Array.isArray(engineParams)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: '[search] engineParams must be an object',
      });
    }

    const names = Object.keys(engineParams);

    if (allowed.size === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: '[search] engineParams is not available on this search controller',
      });
    }

    const refused = names.filter((name) => !allowed.has(normalize(name)));

    if (refused.length > 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[search] engineParams carries a parameter this search controller does not allow | parameters: ${JSON.stringify(refused.slice(0, 5))}`,
      });
    }
  }

  /** The check for a single-collection search body. `raw` mode has no `engineParams`: it is the controller's own choice to serve it. */
  static assertSearchInput(opts: { input: TSearchInput; allowed: ReadonlySet<string> }): void {
    const { input, allowed } = opts;

    if (input.mode === 'raw') {
      return;
    }

    SearchEngineParams.assertAllowed({ engineParams: input.engineParams, allowed });
  }

  /** The check for every entry of a multi-search body. */
  static assertMultiSearchInput(opts: {
    input: TMultiSearchInput;
    allowed: ReadonlySet<string>;
  }): void {
    for (const entry of opts.input.searches) {
      SearchEngineParams.assertAllowed({ engineParams: entry.engineParams, allowed: opts.allowed });
    }
  }
}
