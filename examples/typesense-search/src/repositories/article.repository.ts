import { SearchDataSource } from '@/datasources/search.datasource';
import { ArticleDocument, TArticleDocument } from '@/models/article.model';
import { repository } from '@venizia/ignis';
import { DefaultSearchRepository } from '@venizia/ignis/typesense';

@repository({ model: ArticleDocument, dataSource: SearchDataSource })
export class ArticleRepository extends DefaultSearchRepository<TArticleDocument> {}
