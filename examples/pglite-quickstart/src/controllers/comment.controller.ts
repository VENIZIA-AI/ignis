import { Comment } from '@/models/note.model';
import { CommentRepository } from '@/repositories/comment.repository';
import { controller, ControllerFactory } from '@venizia/ignis';

const BASE_PATH = '/comments';

/** Generates GET /count, GET /, GET /find-one, GET /:id, POST /, PATCH /:id, PATCH /, DELETE /:id, DELETE /. */
const BaseCrudController = ControllerFactory.defineCrudController({
  entity: Comment,
  repository: { name: CommentRepository.name },
  controller: { name: 'CommentController', basePath: BASE_PATH },
});

@controller({ path: BASE_PATH })
export class CommentController extends BaseCrudController {}
