import { Note } from '@/models/note.model';
import { NoteRepository } from '@/repositories/note.repository';
import { controller, ControllerFactory } from '@venizia/ignis';

const BASE_PATH = '/notes';

/** Generates GET /count, GET /, GET /find-one, GET /:id, POST /, PATCH /:id, PATCH /, DELETE /:id, DELETE /. */
const BaseCrudController = ControllerFactory.defineCrudController({
  entity: Note,
  repository: { name: NoteRepository.name },
  controller: { name: 'NoteController', basePath: BASE_PATH },
});

@controller({ path: BASE_PATH })
export class NoteController extends BaseCrudController {}
