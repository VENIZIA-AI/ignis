import { ArticleDocument } from '@/models/article.model';
import { ArticleRepository } from '@/repositories/article.repository';
import { controller, ControllerFactory } from '@venizia/ignis';

const BASE_PATH = '/articles';

/** Generates GET /count, GET /, GET /find-one, GET /:id, POST /, PATCH /:id, PATCH /, DELETE /:id, DELETE /. */
const BaseCrudController = ControllerFactory.defineCrudController({
  entity: ArticleDocument,
  repository: { name: ArticleRepository.name },
  controller: { name: 'ArticleController', basePath: BASE_PATH },
});

@controller({ path: BASE_PATH })
export class ArticleController extends BaseCrudController {}
