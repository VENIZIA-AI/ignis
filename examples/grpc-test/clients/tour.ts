import { NotesService } from '@/generated/notes/v1/notes_pb';
import { Code, ConnectError, createClient, type Transport } from '@connectrpc/connect';

/** What the tour needs: a way to build a transport, since only the caller knows the protocol and the address. */
export interface ITourOptions {
  transport: (opts: { token?: string }) => Transport;
  password: string;
  /** Bidirectional streams need HTTP/2: only the native gRPC port serves them. */
  isBidi: boolean;
  log: (line: string) => void;
}

/** Every call kind of `NotesService`, with a connect-es client, as the user `alice`. */
export class NotesTour {
  static async run(opts: ITourOptions): Promise<void> {
    const { log, password } = opts;

    // 1. Public unary: sign in.
    const anonymous = createClient(NotesService, opts.transport({}));
    const { token } = await anonymous.signIn({ username: 'alice', password });
    log('signed in as alice');

    const client = createClient(NotesService, opts.transport({ token }));

    // 2. Client stream: many requests, one answer.
    const { ids } = await client.importNotes(NotesTour.drafts(), { timeoutMs: 5_000 });
    log(`imported ${ids.length} notes`);

    // 3. Unary, with metadata out and in, and a deadline.
    const { note } = await client.getNote(
      { id: ids[0] },
      {
        timeoutMs: 5_000,
        headers: { 'x-client-name': 'tour' },
        onHeader: (headers) => log(`request id: ${headers.get('x-request-id')}`),
      },
    );
    log(`read: ${note?.title}`);

    // 4. Server stream: one request, many answers, then trailers.
    let listed = 0;

    for await (const answer of client.watchNotes(
      {},
      { onTrailer: (trailers) => log(`trailer x-notes-sent: ${trailers.get('x-notes-sent')}`) },
    )) {
      listed += answer.note ? 1 : 0;
    }

    log(`listed ${listed} notes`);

    // 5. A followed stream never ends by itself: a cancel or a deadline ends it.
    const cancel = new AbortController();
    await NotesTour.expectCode({
      code: Code.Canceled,
      call: async () => {
        for await (const _ of client.watchNotes({ follow: true }, { signal: cancel.signal })) {
          cancel.abort();
        }
      },
    });
    log('canceled a followed stream');

    await NotesTour.expectCode({
      code: Code.DeadlineExceeded,
      call: async () => {
        for await (const _ of client.watchNotes({ follow: true }, { timeoutMs: 500 })) {
          // Reads until the deadline.
        }
      },
    });
    log('a followed stream ran into its deadline');

    // 6. A coded error.
    await NotesTour.expectCode({
      code: Code.InvalidArgument,
      call: () => client.getNote({ id: 'not-an-id' }),
    });
    log('an invalid id is invalid_argument');

    // 7. Bidirectional stream.
    if (opts.isBidi) {
      for await (const answer of client.syncNotes(NotesTour.changes(), { timeoutMs: 5_000 })) {
        log(`sync ${answer.clientRef}: ${answer.result.case}`);
      }
    }

    log('tour done');
  }

  /** The requests of the client stream. */
  private static async *drafts() {
    yield { title: 'first', body: 'sent on a client stream' };
    yield { title: 'second' };
  }

  /** The requests of the bidirectional stream: the second one is refused. */
  private static async *changes() {
    yield { clientRef: 'a', title: 'synced' };
    yield { clientRef: 'b', title: '' };
  }

  /** Runs a call that has to fail with `code`; any other outcome is thrown on. */
  private static async expectCode(opts: { code: Code; call: () => Promise<unknown> }) {
    try {
      await opts.call();
    } catch (error) {
      const failure = ConnectError.from(error);

      if (failure.code === opts.code) {
        return;
      }

      throw failure;
    }

    throw new ConnectError(`Expected the call to fail with ${Code[opts.code]}`, Code.Internal);
  }
}
