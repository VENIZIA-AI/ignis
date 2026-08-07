import type { TErrorDefinition, TRegisterErrors } from '@venizia/ignis-helpers';
import { ErrorScopes, HTTP } from '@venizia/ignis-helpers';

/** Codes a client branches on for a search-tier failure that is the caller's fault. Raised by every engine (Typesense, Meilisearch, and the neutral tier) so the same condition reads the same whichever backs the datasource. */
/** Codes are LITERAL strings, deliberately not `SearchErrorCodes.*`: `MessageCode.build()` returns `string`, which erases the literal type `TRegisterErrors` is built on and silently kills autocomplete. The values are identical to what those constants produce - they are a public contract and must not shift. */
export const SearchErrors = {
  NOT_FOUND: {
    message: { text: 'Document not found', code: 'core.search_engine.not_found' },
    statusCode: HTTP.ResultCodes.RS_4.NotFound,
    category: ErrorScopes.BUSINESS,
  },
  ALREADY_EXISTS: {
    message: { text: 'Document already exists', code: 'core.search_engine.already_exists' },
    statusCode: HTTP.ResultCodes.RS_4.Conflict,
    category: ErrorScopes.BUSINESS,
  },
  /** A `where` key the collection definition does not declare - the search-tier answer to relational's `Column NOT FOUND`. */
  UNKNOWN_FIELD: {
    message: { text: 'Unknown field in filter', code: 'core.search_engine.unknown_field' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.BUSINESS,
  },
  /** A page this engine cannot deliver in one call - more hits than the multi-search budget covers, or a GROUPED query, whose groups cannot be split across windows without inventing an ordering the engine never produced. */
  PAGE_TOO_LARGE: {
    message: { text: 'Requested page is too large', code: 'core.search_engine.page_too_large' },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.BUSINESS,
  },
  /** An operator this engine cannot express. Catalogued because WHICH engine backs the collection is what decides it - the same `where` is valid against one and not the other, so a caller must be able to branch rather than parse prose. */
  UNSUPPORTED_OPERATOR: {
    message: {
      text: 'Operator not supported by this search engine',
      code: 'core.search_engine.unsupported_operator',
    },
    statusCode: HTTP.ResultCodes.RS_4.BadRequest,
    category: ErrorScopes.BUSINESS,
  },
} as const satisfies Record<string, TErrorDefinition>;

/** Registers these codes with the shared key registry so a consumer gets autocomplete on `messageCode`. */
declare module '@venizia/ignis-helpers' {
  interface IErrorKeyRegistry extends TRegisterErrors<typeof SearchErrors> {}
}
