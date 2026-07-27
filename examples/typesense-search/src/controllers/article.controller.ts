import { ArticleDocument } from '@/models/entities';
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
 * Same inference-only call as the Postgres branch: `TEntity` is inferred from `entity`, and because
 * ArticleDocument parameterizes BaseSearchEntity with `typeof ArticleDocument.schema`, the document
 * type flows through count/find/findById/create/updateById/deleteById with no cast.
 * Generates GET /count, GET /, GET /:id, POST /, PATCH /:id, DELETE /:id.
 */
const BaseCrudController = ControllerFactory.defineCrudController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: {
    name: 'ArticleController',
    basePath: BASE_PATH,
  },
});

@controller({ path: BASE_PATH })
export class ArticleController extends BaseCrudController {
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
