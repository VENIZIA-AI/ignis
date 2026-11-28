import { NotesService, type Note } from '@/generated/notes/v1/notes_pb';
import { BearerToken } from '@clients/bearer-token';
import { Code, ConnectError, createClient, type Client } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';

/**
 * A browser client over gRPC-Web. A browser cannot stream a request body, so it has unary and server streaming only.
 */
export class NotesWebClient {
  private token?: string;
  private readonly client: Client<typeof NotesService>;

  constructor(opts: { baseUrl: string }) {
    const transport = createGrpcWebTransport({
      baseUrl: opts.baseUrl,
      interceptors: [BearerToken.interceptor({ read: () => this.token })],
    });

    this.client = createClient(NotesService, transport);
  }

  async signIn(opts: { username: string; password: string }) {
    const { token } = await this.client.signIn(opts, { timeoutMs: 5_000 });
    this.token = token;
  }

  async getNote(opts: { id: string }): Promise<Note> {
    const { note } = await this.client.getNote(opts, { timeoutMs: 5_000 });

    if (!note) {
      throw new ConnectError('The answer holds no note', Code.Internal);
    }

    return note;
  }

  /** Abort the signal to end a followed stream. */
  async *watchNotes(opts: { follow: boolean; signal?: AbortSignal }): AsyncGenerator<Note> {
    const answers = this.client.watchNotes({ follow: opts.follow }, { signal: opts.signal });

    for await (const { note } of answers) {
      if (note) {
        yield note;
      }
    }
  }
}
