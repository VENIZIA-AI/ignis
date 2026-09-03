import { Note } from '@/models/note.model';
import { NoteRepository } from '@/repositories/note.repository';
import {
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
} from '@venizia/ignis-kernel';

const BASE_PATH = '/notes';

/** Generates GET /count, GET /, GET /:id, POST /, PATCH /:id, DELETE /:id. */
const BaseCrudController = ControllerFactory.defineCrudController({
  entity: Note,
  repository: { name: NoteRepository.name },
  controller: {
    name: 'NoteController',
    basePath: BASE_PATH,
  },
});

@controller({ path: BASE_PATH })
export class NoteController extends BaseCrudController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: NoteRepository.name,
      }),
    })
    repository: NoteRepository,
  ) {
    super(repository);
  }
}
