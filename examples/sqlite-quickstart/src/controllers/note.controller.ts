import { NoteRepository } from '@/repositories/note.repository';
import { controller, ControllerFactory, CrudRoutes } from '@venizia/ignis';

const BASE_PATH = '/notes';

/** Generates GET /count, GET /, GET /find-one, GET /:id, POST /, PATCH /:id, PATCH /, DELETE /:id, DELETE /. */
const BaseCrudController = ControllerFactory.crud({
  repository: NoteRepository,
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
export class NoteController extends BaseCrudController {}
