import { ArticleRepository } from '@/repositories/article.repository';
import { controller } from '@venizia/ignis';
import { SearchControllerFactory } from '@venizia/ignis-connectors/typesense/controllers';

const BASE_PATH = '/articles';

/** Generates POST /articles/search (keyword/semantic/hybrid) and POST /articles/multi-search. `mode: 'raw'` and multi-search answer 400 here: a controller opts in with `modes.raw.allow`. */
const BaseSearchController = SearchControllerFactory.build({
  repository: ArticleRepository,
  routes: { search: true, multiSearch: true },
});

/** The factory injects the repository class, so no constructor is needed. */
@controller({ path: BASE_PATH })
export class ArticleSearchController extends BaseSearchController {}
