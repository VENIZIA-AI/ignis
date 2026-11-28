import {
  GetNoteRequestSchema,
  GetNoteResponseSchema,
  ImportNotesRequestSchema,
  ImportNotesResponseSchema,
  NotesService,
  SignInRequestSchema,
  SignInResponseSchema,
  SyncNotesRequestSchema,
  SyncNotesResponseSchema,
  WatchNotesRequestSchema,
  WatchNotesResponseSchema,
  type GetNoteResponse,
  type ImportNotesResponse,
  type SignInResponse,
  type SyncNotesResponse,
  type WatchNotesResponse,
} from '@/generated/notes/v1/notes_pb';
import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
  type MessageShape,
} from '@bufbuild/protobuf';
import * as grpc from '@grpc/grpc-js';
import { getError } from '@venizia/ignis-helpers';

const DEADLINE_MS = 5_000;

/**
 * A @grpc/grpc-js client of the native port. grpc-js moves bytes; the messages are the ones `bun run proto:gen` writes,
 * so no `.proto` is loaded at run time.
 */
export class NotesGrpcJsClient {
  private readonly client: grpc.Client;
  private readonly metadata = new grpc.Metadata();

  /** `ca` turns TLS on and names the certificate to trust; without it the connection is clear text (h2c). */
  constructor(opts: { address: string; ca?: Buffer }) {
    const credentials = opts.ca
      ? grpc.credentials.createSsl(opts.ca)
      : grpc.credentials.createInsecure();

    // The name the certificate of `bun run certs` is checked against: TLS names no server by IP address.
    const options = opts.ca ? { 'grpc.ssl_target_name_override': 'localhost' } : {};

    this.client = new grpc.Client(opts.address, credentials, options);
  }

  close() {
    this.client.close();
  }

  /** Public unary; the token is sent as metadata on every later call. */
  async signIn(opts: { username: string; password: string }) {
    const response = await this.unary<typeof SignInRequestSchema, SignInResponse>({
      method: NotesService.method.signIn.name,
      schema: SignInRequestSchema,
      request: opts,
      decode: (bytes) => fromBinary(SignInResponseSchema, bytes),
    });
    this.metadata.set('authorization', `Bearer ${response.token}`);

    return response;
  }

  getNote(opts: { id: string }) {
    return this.unary<typeof GetNoteRequestSchema, GetNoteResponse>({
      method: NotesService.method.getNote.name,
      schema: GetNoteRequestSchema,
      request: opts,
      decode: (bytes) => fromBinary(GetNoteResponseSchema, bytes),
    });
  }

  /** Server stream. With `follow` it ends only at the deadline, and this method rejects. */
  async watchNotes(opts: { follow: boolean }) {
    const stream = this.client.makeServerStreamRequest(
      this.pathOf({ method: NotesService.method.watchNotes.name }),
      this.encoder({ schema: WatchNotesRequestSchema }),
      (bytes: Buffer): WatchNotesResponse => fromBinary(WatchNotesResponseSchema, bytes),
      create(WatchNotesRequestSchema, opts),
      this.metadata,
      this.callOptions(),
    );
    const answers: WatchNotesResponse[] = [];

    for await (const answer of stream) {
      answers.push(answer);
    }

    return answers;
  }

  /** Client stream. */
  importNotes(opts: { notes: Array<MessageInitShape<typeof ImportNotesRequestSchema>> }) {
    return new Promise<ImportNotesResponse>((resolve, reject) => {
      const stream = this.client.makeClientStreamRequest(
        this.pathOf({ method: NotesService.method.importNotes.name }),
        this.encoder({ schema: ImportNotesRequestSchema }),
        (bytes: Buffer): ImportNotesResponse => fromBinary(ImportNotesResponseSchema, bytes),
        this.metadata,
        this.callOptions(),
        (error, response) => {
          if (error || !response) {
            reject(error ?? getError({ message: '[importNotes] No answer' }));

            return;
          }

          resolve(response);
        },
      );

      for (const note of opts.notes) {
        stream.write(create(ImportNotesRequestSchema, note));
      }

      stream.end();
    });
  }

  /** Bidirectional stream: the answers are read while the requests are written. */
  async syncNotes(opts: { notes: Array<MessageInitShape<typeof SyncNotesRequestSchema>> }) {
    const stream = this.client.makeBidiStreamRequest(
      this.pathOf({ method: NotesService.method.syncNotes.name }),
      this.encoder({ schema: SyncNotesRequestSchema }),
      (bytes: Buffer): SyncNotesResponse => fromBinary(SyncNotesResponseSchema, bytes),
      this.metadata,
      this.callOptions(),
    );

    for (const note of opts.notes) {
      stream.write(create(SyncNotesRequestSchema, note));
    }

    stream.end();
    const answers: SyncNotesResponse[] = [];

    for await (const answer of stream) {
      answers.push(answer);
    }

    return answers;
  }

  private unary<Schema extends DescMessage, Response>(opts: {
    method: string;
    schema: Schema;
    request: MessageInitShape<Schema>;
    decode: (bytes: Buffer) => Response;
  }) {
    return new Promise<Response>((resolve, reject) => {
      this.client.makeUnaryRequest(
        this.pathOf({ method: opts.method }),
        this.encoder({ schema: opts.schema }),
        opts.decode,
        create(opts.schema, opts.request),
        this.metadata,
        this.callOptions(),
        (error, response) => {
          if (error || !response) {
            reject(error ?? getError({ message: `[${opts.method}] No answer` }));

            return;
          }

          resolve(response);
        },
      );
    });
  }

  private pathOf(opts: { method: string }) {
    return `/${NotesService.typeName}/${opts.method}`;
  }

  private encoder<Schema extends DescMessage>(opts: { schema: Schema }) {
    return (message: MessageShape<Schema>) => Buffer.from(toBinary(opts.schema, message));
  }

  /** Always send a deadline: a signed-in call has no idle bound on the server. */
  private callOptions(): grpc.CallOptions {
    return { deadline: Date.now() + DEADLINE_MS };
  }
}
