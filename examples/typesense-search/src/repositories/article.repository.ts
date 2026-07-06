import { SearchDataSource } from '@/datasources/search.datasource';
import { ArticleDocument, TArticleDocument } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { DefaultSearchRepository } from '@venizia/ignis/typesense';

/**
 * ArticleRepository - full CRUD tier over Typesense (Readable -> Persistable -> DefaultSearchRepository).
 *
 * No constructor needed - dataSource auto-injected from the @repository decorator, same convention
 * as the Postgres branch's DefaultCRUDRepository.
 */
@repository({ model: ArticleDocument, dataSource: SearchDataSource })
export class ArticleRepository extends DefaultSearchRepository<TArticleDocument> {
  findByCategory(opts: { category: string }) {
    return this.find({ filter: { where: { category: opts.category } } });
  }
}
