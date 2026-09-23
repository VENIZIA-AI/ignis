import { ArticleDocument } from '@/models/article.model';
import { ArticleRepository } from '@/repositories/article.repository';
import { BindingKeys, BindingNamespaces, controller, inject } from '@venizia/ignis';
import { SearchControllerFactory } from '@venizia/ignis/typesense/controllers';

const BASE_PATH = '/articles';

/** Generates POST /articles/search (keyword/semantic/hybrid/raw) and POST /articles/multi-search. */
const BaseSearchController = SearchControllerFactory.defineSearchController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: { name: 'ArticleSearchController', basePath: BASE_PATH },
});

@controller({ path: BASE_PATH })
export class ArticleSearchController extends BaseSearchController {
  // Unlike ControllerFactory.defineCrudController, the search factory does not register injection
  // metadata for its generated constructor's repository parameter, so a subclass must supply its
  // own `@inject` - a bare `extends BaseSearchController {}` resolves the repository as `undefined`.
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ArticleRepository.name,
      }),
    })
    repository: ArticleRepository,
  ) {
    super(repository);
  }
}
