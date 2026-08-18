import type { AbstractSearchDataSource } from '@/search/core/datasources';
import { PersistableSearchRepository } from './persistable';

/** Full CRUD search-repository tier - convenience alias over `PersistableSearchRepository` (which already carries every write, including delete). */
export class DefaultSearchRepository<
  TDocument extends object = object,
  TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource,
> extends PersistableSearchRepository<TDocument, TDataSource> {}
