import { Permissions } from '@/common/roles';
import { NoteSchemas } from '@/controllers/note.schemas';
import {
  GetNoteResponseSchema,
  ImportNotesResponseSchema,
  NoteSchema,
  NotesService,
  SignInResponseSchema,
  SyncNotesResponseSchema,
  WatchNotesResponseSchema,
  type GetNoteRequest,
  type ImportNotesRequest,
  type SignInRequest,
  type SyncNotesRequest,
  type WatchNotesRequest,
} from '@/generated/notes/v1/notes_pb';
import type { TNote } from '@/models/note.model';
import { AuthService } from '@/services/auth.service';
import { NoteService, type INoteDraft } from '@/services/note.service';
import { create } from '@bufbuild/protobuf';
import type { HandlerContext } from '@connectrpc/connect';
import {
  Authentication,
  BaseGrpcController,
  bidiStream,
  clientStream,
  controller,
  ControllerTransports,
  inject,
  serverStream,
  unary,
} from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';

/** The most notes one `ImportNotes` call may send: a client stream has no total size limit on the native port. */
const MAX_IMPORT = 100;

const SIGNED_IN = { authenticate: { strategies: [Authentication.STRATEGY_JWT] } };
const MAY_READ = { ...SIGNED_IN, authorize: Permissions.NOTE_READ };
const MAY_CREATE = { ...SIGNED_IN, authorize: Permissions.NOTE_CREATE };

/**
 * `notes.v1.NotesService`, one method per RPC. It validates the request, calls a service and builds the answer; the
 * rules live in the services. `authenticate` and `authorize` run before a method does.
 */
@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: NotesService })
export class NotesController extends BaseGrpcController {
  constructor(
    @inject({ target: AuthService }) private readonly authService: AuthService,
    @inject({ target: NoteService }) private readonly noteService: NoteService,
  ) {
    super({ scope: NotesController.name });
  }

  override binding() {}

  /** Public: no `authenticate`. A public call also keeps the server's idle timeout. */
  @unary({ configs: { name: 'signIn' } })
  async signIn(opts: { request: SignInRequest }) {
    const credentials = NoteSchemas.parse({ schema: NoteSchemas.SIGN_IN, value: opts.request });
    const { token } = await this.authService.signIn(credentials);

    return create(SignInResponseSchema, { token });
  }

  @unary({ configs: { name: 'getNote', ...MAY_READ } })
  async getNote(opts: { request: GetNoteRequest; rpc: HandlerContext }) {
    const { request, rpc } = opts;
    const { id } = NoteSchemas.parse({ schema: NoteSchemas.ID, value: request });

    // Request headers (gRPC metadata) are read, response headers are written, before the answer.
    rpc.responseHeader.set('x-notes-api', 'v1');
    rpc.responseHeader.set('x-notes-client', rpc.requestHeader.get('x-client-name') ?? 'unknown');
    // A deadline or a cancel does not stop a handler: check before work worth skipping.
    rpc.signal.throwIfAborted();

    const note = await this.noteService.get({ id });

    return create(GetNoteResponseSchema, { note: this.toMessage({ note }) });
  }

  @serverStream({ configs: { name: 'watchNotes', ...MAY_READ } })
  async *watchNotes(opts: { request: WatchNotesRequest; rpc: HandlerContext }) {
    const { request, rpc } = opts;
    const { follow } = request;
    let sent = 0;

    for await (const note of this.noteService.watch({ follow, signal: rpc.signal })) {
      yield create(WatchNotesResponseSchema, { note: this.toMessage({ note }) });
      sent += 1;
    }

    // Trailers travel after the last message.
    rpc.responseTrailer.set('x-notes-sent', String(sent));
  }

  @clientStream({ configs: { name: 'importNotes', ...MAY_CREATE } })
  async importNotes(opts: { request: AsyncIterable<ImportNotesRequest>; rpc: HandlerContext }) {
    const drafts: INoteDraft[] = [];

    for await (const message of opts.request) {
      if (drafts.length >= MAX_IMPORT) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_4.BadRequest,
          message: `At most ${MAX_IMPORT} notes per call`,
        });
      }

      drafts.push(NoteSchemas.parse({ schema: NoteSchemas.DRAFT, value: message }));
    }

    if (drafts.length === 0) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: 'Send at least one note',
      });
    }

    // A client that left must not have its half-sent import saved.
    opts.rpc.signal.throwIfAborted();

    const notes = await this.noteService.create({ drafts });

    return create(ImportNotesResponseSchema, { ids: notes.map((note) => note.id) });
  }

  @bidiStream({ configs: { name: 'syncNotes', ...MAY_CREATE } })
  async *syncNotes(opts: { request: AsyncIterable<SyncNotesRequest>; rpc: HandlerContext }) {
    for await (const message of opts.request) {
      opts.rpc.signal.throwIfAborted();

      const { clientRef } = message;
      const draft = NoteSchemas.DRAFT.safeParse(message);

      // One bad note is an answer, not the end of the call.
      if (!draft.success) {
        const reason = NoteSchemas.describe({ error: draft.error });

        yield create(SyncNotesResponseSchema, {
          clientRef,
          result: { case: 'rejected', value: reason },
        });
        continue;
      }

      const [saved] = await this.noteService.create({ drafts: [draft.data] });

      yield create(SyncNotesResponseSchema, {
        clientRef,
        result: { case: 'saved', value: this.toMessage({ note: saved }) },
      });
    }
  }

  /** The owner id stays on the server. */
  private toMessage(opts: { note: TNote }) {
    const { id, title, body } = opts.note;

    return create(NoteSchema, { id, title, body });
  }
}
