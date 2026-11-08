import { ArticleRepository } from '@/repositories/article.repository';
import { controller, ControllerFactory, CrudRoutes } from '@venizia/ignis';

const BASE_PATH = '/articles';

/** Generates GET /count, GET /, GET /find-one, GET /:id, POST /, PATCH /:id, PATCH /, DELETE /:id, DELETE /. */
const BaseCrudController = ControllerFactory.crud({
  repository: ArticleRepository,
  routes: {
    ...CrudRoutes.READ,
    create: true,
    updateById: true,
    updateBy: true,
    deleteById: true,
    deleteBy: true,
  },
});

@controller({ path: BASE_PATH })
export class ArticleController extends BaseCrudController {}
