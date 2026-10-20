import { inject } from '../../modules/metadata/injectors';
// Two imports of one class, and both are needed.
// - The VALUE import feeds the thunk, which reads it only when the container resolves.
// - The TYPE import carries the annotation, so `emitDecoratorMetadata` emits `Object` instead of a
//   second, eager reference to a class that is still in its temporal dead zone.
import { NoteService } from './index';
import type { NoteService as TNoteService } from './index';

export class AuthorService {
  constructor(@inject({ target: () => NoteService }) readonly noteService: TNoteService) {}
}
