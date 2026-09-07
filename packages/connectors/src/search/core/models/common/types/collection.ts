import type { ISearchFieldDefinition } from './field';

/** A synonym set. `root` set = one-way (query for root also matches synonyms); absent = multi-way (all interchangeable). */
export interface ISynonym {
  id: string;
  synonyms: string[];
  root?: string;
}

export interface ISearchCollectionDefinition {
  name: string;
  fields: readonly ISearchFieldDefinition[];
  defaultSort?: string;
  defaultQueryBy?: string[];

  /** Declarative synonym sets provisioned alongside the collection (see `BaseSearchDataSource.provisionCollections`). */
  synonyms?: ISynonym[];

  // Known engines get a named key; the index signature admits any third-party or in-house connector without widening the known keys' value types.
  engineOverrides?: {
    typesense?: object;
    meilisearch?: object;
    opensearch?: object;
    elasticsearch?: object;
  } & { [engine: string]: object | undefined };
}

export type TSearchSchema = Record<string, ISearchCollectionDefinition>;
