import type { TSearchFieldType, TVectorDistance } from '../constants';
import type { ISearchEmbedConfig } from './embedding';

export interface ISearchFieldDefinition {
  name: string;
  type: TSearchFieldType;
  searchable?: boolean;
  filterable?: boolean;
  facet?: boolean;
  sortable?: boolean;
  optional?: boolean;
  vector?: { dimensions?: number; distance?: TVectorDistance; embed?: ISearchEmbedConfig };
}

/** Per-field builder flags accepted by `field.*` helpers (./define-search-collection.ts). */
export type TFieldFlags = Pick<
  ISearchFieldDefinition,
  'searchable' | 'filterable' | 'facet' | 'sortable' | 'optional'
>;
