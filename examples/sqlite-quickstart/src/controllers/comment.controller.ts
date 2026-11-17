import { CommentRepository } from '@/repositories/comment.repository';
import { controller, CrudControllerFactory, CrudRoutes } from '@venizia/ignis';

const BASE_PATH = '/comments';

/** Generates GET /count, GET /, GET /find-one, GET /:id, POST /, PATCH /:id, PATCH /, DELETE /:id, DELETE /. */
const BaseCrudController = CrudControllerFactory.build({
  repository: CommentRepository,
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
export class CommentController extends BaseCrudController {}
