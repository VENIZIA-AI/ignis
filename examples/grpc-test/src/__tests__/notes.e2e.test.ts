// End to end: boots the real application (in-memory PGlite, a free port for each server) and calls it
// with real clients over Connect, gRPC-Web and native gRPC.
import { GrpcBindingKeys } from '@venizia/ignis/grpc';
import { AppEnvs, Execution, getError, HTTP } from '@venizia/ignis-helpers';
import { BindingKeys, BindingNamespaces } from '@venizia/ignis';
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { Code, ConnectError, createClient, type Transport } from '@connectrpc/connect';
import {
  createConnectTransport,
  createGrpcTransport,
  createGrpcWebTransport,
} from '@connectrpc/connect-node';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Application } from '@/application';
import { ApplicationConfigs } from '@/common/application-configs';
import { EnvKeys } from '@/common/env-keys';
import { NotesService } from '@/generated/notes/v1/notes_pb';
import { NoteService } from '@/services/note.service';
import { BearerToken } from '@clients/bearer-token';
import { NotesGrpcJsClient } from '@clients/grpc-js.client';
import { NotesTour } from '@clients/tour';
import { NotesWebClient } from '@clients/web/notes-web.client';

const HOST = '127.0.0.1';
const PASSWORD = crypto.randomUUID();
const SEEDED_TITLE = 'Welcome';

class TransportKinds {
  static readonly CONNECT = 'Connect on the application port';
  static readonly GRPC_WEB = 'gRPC-Web on the application port';
  static readonly NATIVE = 'native gRPC on its own port';

  static readonly ALL: TTransportKind[] = [
    TransportKinds.CONNECT,
    TransportKinds.GRPC_WEB,
    TransportKinds.NATIVE,
  ];
}
type TTransportKind =
  | typeof TransportKinds.CONNECT
  | typeof TransportKinds.GRPC_WEB
  | typeof TransportKinds.NATIVE;

let application: Application;
let noteService: NoteService;
let apiUrl = '';
let nativeAddress = '';

const transportOf = (opts: { kind: TTransportKind; token?: string }): Transport => {
  const interceptors = opts.token ? [BearerToken.interceptor({ read: () => opts.token })] : [];

  switch (opts.kind) {
    case TransportKinds.CONNECT: {
      return createConnectTransport({ baseUrl: apiUrl, httpVersion: '1.1', interceptors });
    }
    case TransportKinds.GRPC_WEB: {
      return createGrpcWebTransport({ baseUrl: apiUrl, httpVersion: '1.1', interceptors });
    }
    case TransportKinds.NATIVE: {
      return createGrpcTransport({ baseUrl: `http://${nativeAddress}`, interceptors });
    }
  }
};

const clientOf = (opts: { kind: TTransportKind; token?: string }) => {
  return createClient(NotesService, transportOf(opts));
};

const signIn = async (opts: { kind: TTransportKind; username: string }) => {
  const { token } = await clientOf({ kind: opts.kind }).signIn({
    username: opts.username,
    password: PASSWORD,
  });

  return clientOf({ kind: opts.kind, token });
};

/** The gRPC code a call fails with; a call that succeeds fails the test. */
const codeOf = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (error) {
    return ConnectError.from(error).code;
  }

  throw getError({ message: 'The call was expected to fail' });
};

const expectCode = async (opts: { code: Code; call: () => Promise<unknown> }) => {
  const code = await codeOf(opts.call);
  expect(Code[code]).toBe(Code[opts.code]);
};

const collect = async <Item>(items: AsyncIterable<Item>) => {
  const all: Item[] = [];

  for await (const item of items) {
    all.push(item);
  }

  return all;
};

/** Polls until `check` holds, for at most five seconds. */
const until = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (check()) {
      return;
    }

    await Execution.sleep({ ms: 10 });
  }

  throw getError({ message: 'The condition did not hold within five seconds' });
};

async function* messages<Item>(...items: Item[]) {
  yield* items;
}

beforeAll(async () => {
  AppEnvs.set(EnvKeys.APP_ENV_PGLITE_DATA_DIR, undefined);
  AppEnvs.set(EnvKeys.APP_ENV_JWT_SECRET, `${crypto.randomUUID()}${crypto.randomUUID()}`);
  AppEnvs.set(EnvKeys.APP_ENV_DEMO_PASSWORD, PASSWORD);
  AppEnvs.set(EnvKeys.APP_ENV_GRPC_HOST, HOST);
  AppEnvs.set(EnvKeys.APP_ENV_GRPC_PORT, '0');
  AppEnvs.set(EnvKeys.APP_ENV_GRPC_TLS, 'false');
  AppEnvs.set(EnvKeys.APP_ENV_GRPC_MAX_STREAMS, '100');
  AppEnvs.set(EnvKeys.APP_ENV_GRPC_SHUTDOWN_TIMEOUT_MS, '2000');

  application = new Application({
    scope: 'E2eTest',
    config: { ...ApplicationConfigs.build({ port: 0 }), host: HOST, artifacts: AutoArtifacts },
  });
  application.init();
  await application.start();

  noteService = application.get({
    key: BindingKeys.build<NoteService>({
      namespace: BindingNamespaces.SERVICE,
      key: NoteService.name,
    }),
  });
  apiUrl = `http://${HOST}:${application.getServerPort()}/api/grpc`;

  const address = application.get({ key: GrpcBindingKeys.GRPC_NATIVE_LISTENER }).getAddress();
  nativeAddress = `${HOST}:${address?.port}`;
}, 30_000);

afterAll(async () => {
  await application.stop();
});

for (const kind of TransportKinds.ALL) {
  describe(kind, () => {
    test('sign-in is public; a wrong password is unauthenticated', async () => {
      const client = clientOf({ kind });

      const answer = await client.signIn({ username: 'alice', password: PASSWORD });
      expect(answer.token.split('.')).toHaveLength(3);
      await expectCode({
        code: Code.Unauthenticated,
        call: () => client.signIn({ username: 'alice', password: 'no' }),
      });
      await expectCode({
        code: Code.Unauthenticated,
        call: () => client.signIn({ username: 'nobody', password: PASSWORD }),
      });
    });

    test('every other RPC refuses a call without a token, or with a forged one', async () => {
      for (const client of [clientOf({ kind }), clientOf({ kind, token: 'a.b.c' })]) {
        await expectCode({ code: Code.Unauthenticated, call: () => client.getNote({ id: 'x' }) });
        await expectCode({
          code: Code.Unauthenticated,
          call: () => collect(client.watchNotes({})),
        });
        await expectCode({
          code: Code.Unauthenticated,
          call: () => client.importNotes(messages({ title: 't' })),
        });
      }
    });

    test('the role policy refuses a viewer who writes', async () => {
      const bob = await signIn({ kind, username: 'bob' });

      await expectCode({
        code: Code.PermissionDenied,
        call: () => bob.importNotes(messages({ title: 't' })),
      });
    });

    test('client stream saves the notes; unary reads one, with headers and the request id', async () => {
      const alice = await signIn({ kind, username: 'alice' });
      const { ids } = await alice.importNotes(
        messages({ title: 'first', body: 'one' }, { title: 'second' }),
      );
      expect(ids).toHaveLength(2);

      let headers = new Headers();
      const requestId = crypto.randomUUID();
      const { note } = await alice.getNote(
        { id: ids[0] },
        {
          headers: { [HTTP.Headers.REQUEST_TRACING_ID]: requestId, 'x-client-name': 'e2e' },
          onHeader: (value) => {
            headers = value;
          },
        },
      );

      expect(note).toMatchObject({ title: 'first', body: 'one' });
      expect(headers.get(HTTP.Headers.REQUEST_TRACING_ID)).toBe(requestId);
      expect(headers.get('x-notes-api')).toBe('v1');
      expect(headers.get('x-notes-client')).toBe('e2e');
    });

    test('one invalid note refuses the whole import', async () => {
      const alice = await signIn({ kind, username: 'alice' });
      const before = await collect(alice.watchNotes({}));

      await expectCode({
        code: Code.InvalidArgument,
        call: () => alice.importNotes(messages({ title: 'kept?' }, { title: '' })),
      });
      await expectCode({
        code: Code.InvalidArgument,
        call: () => alice.importNotes(messages<{ title: string }>()),
      });
      await expectCode({ code: Code.InvalidArgument, call: () => alice.getNote({ id: '' }) });

      const after = await collect(alice.watchNotes({}));
      expect(after).toHaveLength(before.length);
    });

    test('the row scope shows a caller only their own notes', async () => {
      const alice = await signIn({ kind, username: 'alice' });
      const bob = await signIn({ kind, username: 'bob' });
      const { ids } = await alice.importNotes(messages({ title: 'private' }));

      await expectCode({ code: Code.NotFound, call: () => bob.getNote({ id: ids[0] }) });

      const seen = await collect(bob.watchNotes({}));
      expect(seen.map((answer) => answer.note?.title)).toEqual([SEEDED_TITLE]);
    });

    test('server stream answers the notes and a trailer', async () => {
      const bob = await signIn({ kind, username: 'bob' });
      let trailers = new Headers();

      const answers = await collect(
        bob.watchNotes(
          {},
          {
            onTrailer: (value) => {
              trailers = value;
            },
          },
        ),
      );

      expect(answers).toHaveLength(1);
      expect(trailers.get('x-notes-sent')).toBe('1');
    });

    test('a followed stream sends new notes, and a cancel releases it on the server', async () => {
      const alice = await signIn({ kind, username: 'alice' });
      const cancel = new AbortController();
      const title = `live ${crypto.randomUUID()}`;
      const seen: string[] = [];

      const code = codeOf(async () => {
        for await (const answer of alice.watchNotes({ follow: true }, { signal: cancel.signal })) {
          seen.push(answer.note?.title ?? '');

          if (answer.note?.title === title) {
            cancel.abort();
          }
        }
      });

      await until(() => noteService.countWatchers() === 1);
      await alice.importNotes(messages({ title }));

      const outcome = await code;
      expect(outcome).toBe(Code.Canceled);
      expect(seen).toContain(title);
      await until(() => noteService.countWatchers() === 0);
    });

    test('a deadline ends a followed stream, and releases it on the server', async () => {
      const alice = await signIn({ kind, username: 'alice' });

      await expectCode({
        code: Code.DeadlineExceeded,
        call: () => collect(alice.watchNotes({ follow: true }, { timeoutMs: 500 })),
      });
      await until(() => noteService.countWatchers() === 0);
    });
  });
}

describe('bidirectional stream', () => {
  test('the native port answers each note, and a refused note does not end the call', async () => {
    const alice = await signIn({ kind: TransportKinds.NATIVE, username: 'alice' });

    const answers = await collect(
      alice.syncNotes(
        messages(
          { clientRef: 'a', title: 'ok' },
          { clientRef: 'b', title: '' },
          { clientRef: 'c', title: 'ok too' },
        ),
      ),
    );

    expect(answers.map((answer) => [answer.clientRef, answer.result.case])).toEqual([
      ['a', 'saved'],
      ['b', 'rejected'],
      ['c', 'saved'],
    ]);
  });

  test('the native port refuses it without a token, and from a viewer', async () => {
    const anonymous = clientOf({ kind: TransportKinds.NATIVE });
    const bob = await signIn({ kind: TransportKinds.NATIVE, username: 'bob' });
    const send = () => messages({ clientRef: 'a', title: 't' });

    await expectCode({
      code: Code.Unauthenticated,
      call: () => collect(anonymous.syncNotes(send())),
    });
    await expectCode({ code: Code.PermissionDenied, call: () => collect(bob.syncNotes(send())) });
  });

  test('a cancel and a deadline end it', async () => {
    const alice = await signIn({ kind: TransportKinds.NATIVE, username: 'alice' });

    async function* quiet() {
      yield { clientRef: 'a', title: 't' };
      await Execution.sleep({ ms: 1_500 });
    }

    await expectCode({
      code: Code.DeadlineExceeded,
      call: () => collect(alice.syncNotes(quiet(), { timeoutMs: 300 })),
    });

    const cancel = new AbortController();
    await expectCode({
      code: Code.Canceled,
      call: async () => {
        for await (const answer of alice.syncNotes(quiet(), { signal: cancel.signal })) {
          cancel.abort(answer.clientRef);
        }
      },
    });
  });

  test('the application port refuses it: it needs HTTP/2', async () => {
    const response = await fetch(`${apiUrl}/notes.v1.NotesService/SyncNotes`, {
      method: HTTP.Methods.POST,
      headers: { [HTTP.Headers.CONTENT_TYPE]: 'application/connect+proto' },
      body: new Uint8Array(),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_5.HTTPVersionNotSupported);
  });
});

describe('the example clients', () => {
  test('connect-node: the tour runs on both ports', async () => {
    for (const kind of TransportKinds.ALL) {
      const lines: string[] = [];

      await NotesTour.run({
        transport: (opts) => transportOf({ kind, ...opts }),
        password: PASSWORD,
        isBidi: kind === TransportKinds.NATIVE,
        log: (line) => lines.push(line),
      });

      expect(lines.at(-1)).toBe('tour done');
    }
  });

  test('the browser client: sign in, unary and server stream over gRPC-Web', async () => {
    const web = new NotesWebClient({ baseUrl: apiUrl });
    await web.signIn({ username: 'bob', password: PASSWORD });

    const notes = await collect(web.watchNotes({ follow: false }));
    expect(notes.map((note) => note.title)).toEqual([SEEDED_TITLE]);

    const note = await web.getNote({ id: notes[0].id });
    expect(note.title).toBe(SEEDED_TITLE);
  });

  test('grpc-js: all four call kinds on the native port', async () => {
    const client = new NotesGrpcJsClient({ address: nativeAddress });

    try {
      await client.signIn({ username: 'alice', password: PASSWORD });
      const imported = await client.importNotes({ notes: [{ title: 'from grpc-js' }] });
      expect(imported.ids).toHaveLength(1);

      const note = await client.getNote({ id: imported.ids[0] });
      expect(note.note?.title).toBe('from grpc-js');

      const watched = await client.watchNotes({ follow: false });
      expect(watched.map((answer) => answer.note?.id)).toContain(imported.ids[0]);

      const synced = await client.syncNotes({ notes: [{ clientRef: 'a', title: 'synced' }] });
      expect(synced.map((answer) => answer.result.case)).toEqual(['saved']);
    } finally {
      client.close();
    }
  });
});

describe('the application port', () => {
  test('answers the health check', async () => {
    const response = await fetch(`http://${HOST}:${application.getServerPort()}/api/health`);

    expect(response.status).toBe(HTTP.ResultCodes.RS_2.Ok);
  });

  test('serves the browser page that web:build bundles', async () => {
    const build = Bun.spawn([process.execPath, 'scripts/web-build.ts']);
    const result = await build.exited;
    expect(result).toBe(0);

    const origin = `http://${HOST}:${application.getServerPort()}`;
    const page = await fetch(`${origin}/demo`);
    const script = await fetch(`${origin}/demo/main.js`);

    expect(page.headers.get(HTTP.Headers.CONTENT_TYPE)).toContain('text/html');
    expect(script.headers.get(HTTP.Headers.CONTENT_TYPE)).toContain('javascript');
  });
});

// Last: it stops the application.
describe('shutdown', () => {
  test('stop() ends the followed streams of both ports with unavailable', async () => {
    const codes: Array<Promise<Code>> = [];

    for (const kind of TransportKinds.ALL) {
      const alice = await signIn({ kind, username: 'alice' });
      codes.push(codeOf(() => collect(alice.watchNotes({ follow: true }))));
    }

    await until(() => noteService.countWatchers() === codes.length);
    await application.stop();

    const outcomes = await Promise.all(codes);
    expect(outcomes).toEqual(codes.map(() => Code.Unavailable));
    expect(noteService.countWatchers()).toBe(0);
  });
});
