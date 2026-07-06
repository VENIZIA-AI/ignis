import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import type { CollectionSchema, CollectionFieldSchema } from 'typesense/lib/Typesense/Collection';
import type {
  SearchParams,
  SearchResponse,
  SearchOptions,
  ImportResponse,
  DocumentSchema,
} from 'typesense/lib/Typesense/Documents';
import type { TConstValue } from '@venizia/ignis-helpers';
import type { ISearchDriverCallbacks } from './driver';

// Re-export Typesense types under stable T-prefixed aliases (type-only; erased at runtime).
// Note: CollectionFieldSchema is exported from Collection (singular), not Collections.
export type TDocumentSchema = DocumentSchema;
export type TCollectionCreateSchema = CollectionCreateSchema;
export type TCollectionSchema = CollectionSchema;
export type TCollectionFieldSchema = CollectionFieldSchema;
export type TSearchParams = SearchParams<TDocumentSchema>;
export type TSearchResponse<T extends TDocumentSchema = TDocumentSchema> = SearchResponse<T>;
// Per-request client options, forwarded verbatim by the driver alongside SearchParams.
export type TSearchOptions = SearchOptions;
export type TImportResponse = ImportResponse;

// Driver-owned (not re-exported): typesense's MultiSearchRequestsSchema/MultiSearchResponse are
// conditional generics unsuitable for a clean passthrough API.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type IMultiSearchEntry = Partial<TSearchParams> & { collection: string };
export interface IMultiSearchResult<T extends TDocumentSchema = TDocumentSchema> {
  results: TSearchResponse<T>[];
}

export interface ITypesenseNode {
  host: string;
  port: number;
  protocol?: string;
}

export interface ITypesenseDriverOptions extends ISearchDriverCallbacks {
  name: string;
  nodes: ITypesenseNode[];
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
  scope?: string;
  identifier?: string;
}

export class TypesenseImportActions {
  static readonly CREATE = 'create';
  static readonly UPSERT = 'upsert';
  static readonly UPDATE = 'update';
  static readonly EMPLACE = 'emplace';
  static readonly SCHEME_SET = new Set<string>([
    this.CREATE,
    this.UPSERT,
    this.UPDATE,
    this.EMPLACE,
  ]);
  static isValid(value: string): value is TTypesenseImportAction {
    return this.SCHEME_SET.has(value);
  }
}

export type TTypesenseImportAction = TConstValue<typeof TypesenseImportActions>;

export class TypesenseDirtyValues {
  static readonly COERCE_OR_REJECT = 'coerce_or_reject';
  static readonly COERCE_OR_DROP = 'coerce_or_drop';
  static readonly DROP = 'drop';
  static readonly REJECT = 'reject';
  static readonly SCHEME_SET = new Set<string>([
    this.COERCE_OR_REJECT,
    this.COERCE_OR_DROP,
    this.DROP,
    this.REJECT,
  ]);
  static isValid(value: string): value is TTypesenseDirtyValue {
    return this.SCHEME_SET.has(value);
  }
}

export type TTypesenseDirtyValue = TConstValue<typeof TypesenseDirtyValues>;

// -- Datasource option types (src/connectors/typesense/datasources/*) --

export interface ISearchDataSourceOptions<Settings extends object = {}> {
  name: string;
  config: Settings;
  /** Auto-provision discovered collections on configure(). Defaults to true. */
  autoProvision?: boolean;
}

export interface ITypesenseDataSourceSettings {
  nodes: Array<{ host: string; port: number; protocol?: string }>;
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
}
