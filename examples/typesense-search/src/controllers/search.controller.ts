import { ArticleDocument } from '@/models/article.model';
import { ArticleRepository } from '@/repositories/article.repository';
import { controller } from '@venizia/ignis';
import { SearchControllerFactory } from '@venizia/ignis/typesense/controllers';

const BASE_PATH = '/articles';

/** Generates POST /articles/search (keyword/semantic/hybrid/raw) and POST /articles/multi-search. */
const BaseSearchController = SearchControllerFactory.defineSearchController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: { name: 'ArticleSearchController', basePath: BASE_PATH },
});

/** The factory injects the repository named in `repository.name`, so no constructor is needed. */
@controller({ path: BASE_PATH })
export class ArticleSearchController extends BaseSearchController {}
