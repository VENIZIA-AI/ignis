import { ArticleDocument, TArticleDocument } from '@/models/entities';
import { ArticleRepository } from '@/repositories';
import {
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
} from '@venizia/ignis';

const BASE_PATH = '/articles';

/**
 * Typed generic - TArticleDocument (derived from ArticleDocument.schema via
 * TInferSearchDocument) flows through count/find/findById/create/updateById/deleteById with no cast.
 * Generates GET /count, GET /, GET /:id, POST /, PATCH /:id, DELETE /:id.
 */
const _Controller = ControllerFactory.defineCrudController<TArticleDocument>({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: {
    name: 'ArticleController',
    basePath: BASE_PATH,
  },
});

@controller({ path: BASE_PATH })
export class ArticleController extends _Controller {
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
