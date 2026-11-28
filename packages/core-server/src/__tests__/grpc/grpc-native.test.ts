import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { Logger } from '@venizia/ignis-helpers/winston';
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import type { HandlerContext } from '@connectrpc/connect';
import { createConnectTransport, createGrpcTransport } from '@connectrpc/connect-node';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { HTTP, type TClass, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError, Execution, ExecutionModes } from '@venizia/ignis-helpers/core';
import {
  AuthenticationStrategyRegistry,
  bidiStream,
  clientStream,
  Container,
  ControllerTransports,
  serverStream,
  unary,
  type IApplicationInfo,
  type IAuthenticationStrategy,
  type TContext,
  type TRouteContext,
  AuthorizationEnforcerTypes,
  AuthorizeBindingKeys,
  type IAuthorizeOptions,
} from '@venizia/ignis-kernel';
import { connect as connectHttp2 } from 'node:http2';
import { connect as connectTcp } from 'node:net';
import type { ClientHttp2Session } from 'node:http2';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BaseApplication } from '@/base/applications';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import type { IGrpcNativeOptions } from '@/base/controllers/grpc/native/common/types';
import { GrpcBindingKeys } from '@/components/controller/grpc';
import { controller, useRequestContext } from '@/base/metadata';
import { GrpcNativeCallStore } from '@/base/controllers/grpc/native/call.store';
import { createFreshRegistry, TestAuthorizationEnforcer } from '../authorize/helpers';

/** `greeter.v1.GreeterService`: unary `SayHello`, `ListHellos` (server), `Collect` (client), `Chat` (bidi). */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIi4KDEhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJEhAKCHNsZWVwX21zGAIgASgFIiAKDUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTKZAgoOR3JlZXRlclNlcnZpY2USPwoIU2F5SGVsbG8SGC5ncmVldGVyLnYxLkhlbGxvUmVxdWVzdBoZLmdyZWV0ZXIudjEuSGVsbG9SZXNwb25zZRJDCgpMaXN0SGVsbG9zEhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UwARJACgdDb2xsZWN0EhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UoARI/CgRDaGF0EhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UoATABYgZwcm90bzM',
  ),
  0,
);

const KEY = 'x-native-key';

class NativeKeyStrategy implements IAuthenticationStrategy {
  name = KEY;

  async authenticate(context: TContext) {
    if (context.req.header(KEY) !== 'ok') {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.Unauthorized, message: 'Bad key' });
    }

    return { userId: 'u1', principalType: 'user' };
  }
}

AuthenticationStrategyRegistry.getInstance().register({
  container: new Container({ scope: 'grpc-native-strategies' }),
  strategies: [{ name: KEY, strategy: NativeKeyStrategy }],
});

const GATE = { authenticate: { strategies: [KEY] } };
const seen: { aborted: number; abortFrames: unknown[]; ip?: string | null; added?: number } = {
  aborted: 0,
  abortFrames: [],
};
const textOf = (request: unknown) => String(Reflect.get(Object(request), 'name'));

/** Sleeps `ms`, or rejects when `signal` aborts. */
const wait = (opts: { ms: number; signal: AbortSignal }) => {
  return new Promise<void>((resolve, reject) => {
    const ended = new AbortController();
    const timer = setTimeout(() => {
      ended.abort();
      resolve();
    }, opts.ms);
    // Removed when the sleep ends: ConnectRPC aborts the signal of a finished call too.
    opts.signal.addEventListener(
      'abort',
      () => {
        seen.aborted += 1;
        seen.abortFrames.push(Execution.current());
        clearTimeout(timer);
        reject(opts.signal.reason);
      },
      { signal: ended.signal },
    );
  });
};

@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterService })
class GreeterController extends BaseGrpcController {
  constructor() {
    super({ scope: 'GreeterController' });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello', ...GATE } })
  async sayHello(opts: {
    request: unknown;
    rpc: HandlerContext;
    context: TRouteContext<{ Bindings: GrpcNativeCallStore }>;
  }) {
    const text = textOf(opts.request);

    if (text === 'conflict') {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.Conflict, message: 'Already there' });
    }

    if (text === 'crash') {
      throw getError({ statusCode: 500, message: 'secret detail' });
    }

    if (text.startsWith('sleep:')) {
      await wait({ ms: Number(text.slice(6)), signal: opts.rpc.signal });
    }

    opts.rpc.responseHeader.set('x-greeter', 'v2');
    opts.rpc.responseTrailer.set('x-cost', '3');

    if (GrpcNativeCallStore.read({ env: opts.context.env })) {
      seen.ip = opts.context.env.requestIP()?.address;
    }

    return { message: `hello ${text} context=${useRequestContext() !== undefined}` };
  }

  @serverStream({ configs: { name: 'listHellos', ...GATE } })
  async *listHellos(opts: { request: unknown }) {
    yield { message: 'first' };

    if (textOf(opts.request) === 'fail') {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.Conflict, message: 'Changed meanwhile' });
    }

    await Execution.sleep({ ms: Number(textOf(opts.request)) });
    yield { message: 'second' };
  }

  @clientStream({ configs: { name: 'collect', ...GATE } })
  async collect(opts: { request: AsyncIterable<unknown>; rpc: HandlerContext }) {
    const received: string[] = [];
    const added = spyOn(opts.rpc.signal, 'addEventListener');

    for await (const message of opts.request) {
      received.push(textOf(message));
    }

    seen.added = added.mock.calls.length;

    return { message: received.join(',') };
  }

  @bidiStream({ configs: { name: 'chat', ...GATE } })
  async *chat(opts: { request: AsyncIterable<unknown> }) {
    for await (const message of opts.request) {
      yield { message: textOf(message) };
    }
  }
}

/** The real `authorize` middleware on unary and client stream, and a public server stream. */
@controller({ path: '/secure', transport: ControllerTransports.GRPC, service: GreeterService })
class SecureController extends BaseGrpcController {
  constructor() {
    super({ scope: 'SecureController' });
  }

  override binding() {}

  @unary({
    configs: { name: 'sayHello', ...GATE, authorize: { action: 'read', resource: 'Greeting' } },
  })
  async sayHello() {
    return { message: 'allowed' };
  }

  @clientStream({
    configs: { name: 'collect', ...GATE, authorize: { action: 'delete', resource: 'Greeting' } },
  })
  async collect() {
    return { message: 'deleted' };
  }

  @serverStream({ configs: { name: 'listHellos' } })
  async *listHellos() {
    yield { message: 'first' };
    await Execution.sleep({ ms: 2_500 });
    yield { message: 'second' };
  }
}

const IDLE_SECONDS = 1;
const QUIET_MS = 2_500;

/** Refusal bodies longer than `grpc-message` carries, by the `x-block` value that asks for each. */
const LONG_REFUSALS: Record<string, string> = {
  plain: 'x'.repeat(200_000),
  spaces: 'ab '.repeat(70_000),
  emoji: `${'x'.repeat(1_023)}😀`,
  vietnamese: 'Lỗi đã xảy ra, vui lòng thử lại. '.repeat(200),
};

class NativeApplication extends BaseApplication {
  constructor(
    private native: IGrpcNativeOptions | undefined,
    private greeter: TClass<BaseGrpcController> = GreeterController,
  ) {
    super({
      scope: 'NativeApplication',
      config: {
        host: '127.0.0.1',
        port: 0,
        path: { base: '/api', isStrict: false },
        transports: [ControllerTransports.REST, ControllerTransports.GRPC],
        server: { idleTimeout: IDLE_SECONDS },
        error: { rootKey: 'error' },
      },
    });
  }

  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'grpc-native', version: '0.0.0', description: 'native gRPC' };
  }

  override staticConfigure() {}

  override preConfigure() {
    this.bind({ key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS }).toValue(
      this.native ? { native: { use: true, ...this.native } } : {},
    );
    this.controller(this.greeter);
  }

  override postConfigure() {}

  override setupMiddlewares() {
    this.getServer().use('*', async (context, next) => {
      const long = LONG_REFUSALS[context.req.header('x-block') ?? ''];

      if (long !== undefined) {
        return context.text(long, 429);
      }

      if (context.req.header('x-block') === 'surrogate') {
        return context.json({ message: `bad ${String.fromCharCode(0xd800)} text` }, 429);
      }

      if (context.req.header('x-block')) {
        context.header('retry-after', '7');

        return context.json({ message: 'blocked early' }, 429);
      }

      context.header('x-seen-by', 'global');
      await next();

      return undefined;
    });
    this.getRootRouter().get('/echo', (context) => context.json({ ok: true }));
  }
}

const start = async (
  native: IGrpcNativeOptions | undefined,
  greeter?: TClass<BaseGrpcController>,
) => {
  const application = new NativeApplication(native, greeter);
  application.init();
  await application.start();

  return application;
};

const addressOf = (application: NativeApplication) => {
  const listener = application.get({ key: GrpcBindingKeys.GRPC_NATIVE_LISTENER });
  const address = listener.getAddress();

  if (!address) {
    throw getError({ message: 'The native listener is not listening' });
  }

  return `${address.host}:${address.port}`;
};

let application: NativeApplication;

beforeAll(async () => {
  const started = await start({ port: 0, limits: { concurrentStreams: 2 } });
  application = started;
});

afterAll(async () => {
  await application.stop();
});

const client = (opts?: { url?: string; ca?: Buffer }) => {
  return createClient(
    GreeterService,
    createGrpcTransport({
      baseUrl: opts?.url ?? `http://${addressOf(application)}`,
      nodeOptions: opts?.ca ? { ca: opts.ca } : undefined,
    }),
  );
};

const SIGNED_IN = { [KEY]: 'ok' };

/** The `ConnectError` a call fails with. */
const failureOf = async (task: Promise<unknown>) => {
  const [outcome] = await Promise.allSettled([task]);

  if (outcome.status === 'fulfilled') {
    throw getError({ message: 'expected the call to fail' });
  }

  const error = ConnectError.from(outcome.reason);

  return { code: error.code, message: error.rawMessage };
};

const invoke = (
  name: string,
  opts?: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal },
) => {
  const method: unknown = Reflect.get(client(), 'sayHello');

  if (typeof method !== 'function') {
    throw getError({ message: 'no method' });
  }

  const answer: Promise<unknown> = method({ name }, { headers: SIGNED_IN, ...opts });

  return answer;
};

const collectStream = async (
  method: string,
  request: unknown,
  headers: Record<string, string> = SIGNED_IN,
) => {
  const run: unknown = Reflect.get(client(), method);

  if (typeof run !== 'function') {
    throw getError({ message: 'no method' });
  }

  const messages: AsyncIterable<unknown> = run(request, { headers });
  const texts: string[] = [];

  for await (const message of messages) {
    texts.push(String(Reflect.get(Object(message), 'message')));
  }

  return texts;
};

async function* names(pauseMs = 0) {
  yield { name: 'a' };
  await Execution.sleep({ ms: pauseMs });
  yield { name: 'b' };
}

/** How a raw HTTP/2 request ended. */
interface IRawResult {
  status?: string;
  code?: string;
  message?: string;
  requestId?: string;
  retryAfter?: string;
  reset?: number;
  ms: number;
}

/** One raw HTTP/2 request: how it ended, for the cases no gRPC client sends. */
const raw = (opts: {
  headers: Record<string, string>;
  endStream?: boolean;
  session?: ClientHttp2Session;
}) => {
  const session = opts.session ?? connectHttp2(`http://${addressOf(application)}`);

  return new Promise<IRawResult>((resolve) => {
    const startedAt = performance.now();
    const stream = session.request(opts.headers, { endStream: opts.endStream ?? true });
    const result: Omit<IRawResult, 'reset' | 'ms'> = {};

    const read = (headers: Record<string, unknown>) => {
      result.status ??= headers[':status'] === undefined ? undefined : String(headers[':status']);
      result.code ??=
        headers['grpc-status'] === undefined ? undefined : String(headers['grpc-status']);
      result.message ??=
        headers['grpc-message'] === undefined ? undefined : String(headers['grpc-message']);
      result.requestId ??=
        headers['x-request-id'] === undefined ? undefined : String(headers['x-request-id']);
      result.retryAfter ??=
        headers['retry-after'] === undefined ? undefined : String(headers['retry-after']);
    };

    stream.on('response', read);
    stream.on('trailers', read);
    stream.on('data', () => {});
    stream.on('error', () => {});
    stream.once('close', () => {
      resolve({ ...result, reset: stream.rstCode, ms: performance.now() - startedAt });

      if (!opts.session) {
        session.close();
      }
    });
  });
};

const SAY_HELLO = '/greeter.v1.GreeterService/SayHello';
const grpcHeaders = (extra: Record<string, string> = {}) => ({
  ':method': 'POST',
  ':path': SAY_HELLO,
  'content-type': 'application/grpc',
  te: 'trailers',
  ...extra,
});

/** A self-signed certificate for localhost, made in `folder`. */
const certificate = (folder: string) => {
  const keyFile = path.join(folder, 'key.pem');
  const certFile = path.join(folder, 'cert.pem');
  const openssl = Bun.spawnSync([
    'openssl',
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyFile,
    '-out',
    certFile,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ]);

  if (openssl.exitCode !== 0) {
    throw getError({ message: 'openssl could not make the test certificate' });
  }

  return { use: true as const, key: readFileSync(keyFile), cert: readFileSync(certFile) };
};

describe('native gRPC port - calls', () => {
  test('a unary call answers with headers, trailers, middleware headers, context and the caller address', async () => {
    const received: Record<string, string | null> = {};
    const method: unknown = Reflect.get(client(), 'sayHello');

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    const answer: unknown = await method(
      { name: 'ann' },
      {
        headers: SIGNED_IN,
        onHeader: (headers: Headers) => {
          received.greeter = headers.get('x-greeter');
          received.global = headers.get('x-seen-by');
          received.requestId = headers.get('x-request-id');
        },
        onTrailer: (trailers: Headers) => {
          received.cost = trailers.get('x-cost');
        },
      },
    );

    expect(answer).toHaveProperty('message', 'hello ann context=true');
    expect(received).toMatchObject({ greeter: 'v2', global: 'global', cost: '3' });
    expect(received.requestId).toBeTruthy();
    expect(seen.ip).toBe('127.0.0.1');
  });

  test('the four kinds of call', async () => {
    const result = await collectStream('listHellos', { name: '0' });
    expect(result).toEqual(['first', 'second']);
    const result2 = await collectStream('chat', names());
    expect(result2).toEqual(['a', 'b']);
    const collect: unknown = Reflect.get(client(), 'collect');

    if (typeof collect !== 'function') {
      throw getError({ message: 'no method' });
    }

    const answer: unknown = await collect(names(), { headers: SIGNED_IN });
    expect(answer).toHaveProperty('message', 'a,b');
  });

  test('errors keep their codes and the public message policy', async () => {
    const result3 = await failureOf(invoke('conflict'));
    expect(result3).toEqual({
      code: Code.Aborted,
      message: 'Already there',
    });
    const crash = await failureOf(invoke('crash'));

    expect(crash.code).toBe(Code.Internal);
    expect(crash.message).not.toContain('secret');
  });

  test('authenticate refuses before the first message, on a client stream and a bidi call', async () => {
    const collect: unknown = Reflect.get(client(), 'collect');

    if (typeof collect !== 'function') {
      throw getError({ message: 'no method' });
    }

    const pending: Promise<unknown> = collect(names(QUIET_MS), { headers: {} });
    const onClientStream = await failureOf(pending);
    const onBidi = await failureOf(collectStream('chat', names(QUIET_MS), {}));

    expect(onClientStream.code).toBe(Code.Unauthenticated);
    expect(onBidi.code).toBe(Code.Unauthenticated);
  });

  test('a failure after the first message ends the stream with its code', async () => {
    const result4 = await failureOf(collectStream('listHellos', { name: 'fail' }));
    expect(result4).toEqual({
      code: Code.Aborted,
      message: 'Changed meanwhile',
    });
  });

  test('a deadline and a client that leaves reach rpc.signal', async () => {
    seen.aborted = 0;
    const late = await failureOf(invoke('sleep:5000', { timeoutMs: 100 }));
    const abort = new AbortController();
    const left = failureOf(invoke('sleep:5000', { signal: abort.signal }));
    await Execution.sleep({ ms: 200 });
    abort.abort();
    const canceled = await left;
    await Execution.sleep({ ms: 200 });

    expect(late.code).toBe(Code.DeadlineExceeded);
    expect(canceled.code).toBe(Code.Canceled);
    expect(seen.aborted).toBe(2);
  });
});

describe('native gRPC port - refusals and limits', () => {
  test('a middleware that answers early is a trailers-only refusal with the mapped code', async () => {
    const result = await raw({ headers: grpcHeaders({ 'x-block': '1' }) });

    expect(result).toMatchObject({
      status: '200',
      code: String(14),
      message: encodeURIComponent('blocked early'),
    });
  });

  test('a refusal keeps the headers of earlier middleware', async () => {
    const result = await raw({ headers: grpcHeaders({ 'x-block': '1' }) });

    expect(result.requestId).toBeTruthy();
    expect(result.retryAfter).toBe('7');
  });

  test('a refused call whose request never ends is reset at once', async () => {
    const result = await raw({ headers: grpcHeaders({ 'x-block': '1' }), endStream: false });

    expect(result.code).toBe(String(Code.Unavailable));
    expect(result.ms).toBeLessThan(IDLE_SECONDS * 1_000 - 200);
  });

  for (const [name, body] of Object.entries(LONG_REFUSALS)) {
    test(`a long refusal body (${name}) is cut between whole characters`, async () => {
      const result = await raw({ headers: grpcHeaders({ 'x-block': name }) });
      const message = decodeURIComponent(result.message ?? '');

      expect(result.code).toBe(String(Code.Unavailable));
      expect(result.message?.length).toBeLessThanOrEqual(1_024);
      expect(result.message?.length).toBeGreaterThan(1_000);
      expect(body.startsWith(message)).toBe(true);
    });
  }

  test('a refusal message with half a character still carries its status', async () => {
    const result = await raw({ headers: grpcHeaders({ 'x-block': 'surrogate' }) });

    expect(result.code).toBe(String(Code.Unavailable));
    expect(decodeURIComponent(result.message ?? '')).toBe(
      `bad ${String.fromCharCode(0xfffd)} text`,
    );
  });

  test('the method is POST, spelled so', async () => {
    for (const spelled of ['PoSt', 'post']) {
      const result = await raw({ headers: grpcHeaders({ ':method': spelled }) });

      expect(result.code).toBe(String(Code.Unimplemented));
    }
  });

  test('only RPC paths are served, with POST', async () => {
    const rest = await raw({ headers: grpcHeaders({ ':path': '/api/echo' }) });
    const get = await raw({ headers: grpcHeaders({ ':method': 'GET' }) });

    expect(rest.code).toBe(String(Code.Unimplemented));
    expect(get.code).toBe(String(Code.Unimplemented));
  });

  test('an odd authority does not take the listener down', async () => {
    await raw({ headers: grpcHeaders({ ':authority': '[[[' }) });
    const after = await invoke('still');

    expect(after).toHaveProperty('message', 'hello still context=true');
  });

  test('a stream with headers and nothing else is closed at the idle timeout', async () => {
    const result = await raw({ headers: grpcHeaders(SIGNED_IN), endStream: false });

    expect(result.ms).toBeGreaterThanOrEqual(IDLE_SECONDS * 1_000 - 100);
    expect(result.ms).toBeLessThan(QUIET_MS);
  });

  test('a signed-in call may stay quiet longer than the idle timeout', async () => {
    const [stream, answer] = await Promise.all([
      collectStream('listHellos', { name: String(QUIET_MS) }),
      invoke(`sleep:${QUIET_MS}`),
    ]);

    expect(stream).toEqual(['first', 'second']);
    expect(answer).toHaveProperty('message', `hello sleep:${QUIET_MS} context=true`);
  });

  test('one connection holds the configured number of streams at once', async () => {
    const session = connectHttp2(`http://${addressOf(application)}`);
    const settings = new Promise<number | undefined>((resolve) => {
      session.once('remoteSettings', (remote) => resolve(remote.maxConcurrentStreams));
    });

    const result2 = await settings;
    expect(result2).toBe(2);
    session.close();
  });
});

describe('native gRPC port - authorize and public calls', () => {
  test('authorize allows and denies, and a public stream keeps the idle timeout', async () => {
    const registry = createFreshRegistry();
    const container = new Container({ scope: 'grpc-native-enforcer' });
    container
      .bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS })
      .toValue({ defaultDecision: 'deny' });
    registry.register({
      container,
      enforcers: [
        {
          enforcer: TestAuthorizationEnforcer,
          name: 'test',
          type: AuthorizationEnforcerTypes.CUSTOM,
        },
      ],
    });
    TestAuthorizationEnforcer.rules = [
      { action: 'read', resource: 'Greeting', effect: 'allow' },
      { action: 'delete', resource: 'Greeting', effect: 'deny' },
    ];
    const secure = await start({ port: 0 }, SecureController);
    const url = `http://${addressOf(secure)}`;

    const run = (method: string, request: unknown, headers: Record<string, string>) => {
      const task: unknown = Reflect.get(client({ url }), method);

      if (typeof task !== 'function') {
        throw getError({ message: 'no method' });
      }

      return Reflect.apply(task, undefined, [request, { headers }]);
    };

    const allowed: unknown = await run('sayHello', {}, SIGNED_IN);
    const denied = await failureOf(run('collect', names(), SIGNED_IN));
    const stream: AsyncIterable<unknown> = run('listHellos', {}, {});
    const texts: unknown[] = [];
    const cut = await failureOf(
      (async () => {
        for await (const message of stream) {
          texts.push(message);
        }
      })(),
    );
    await secure.stop();

    expect(allowed).toHaveProperty('message', 'allowed');
    expect(denied.code).toBe(Code.PermissionDenied);
    expect(texts).toHaveLength(1);
    expect(cut.code).not.toBe(Code.Unauthenticated);
  });

  test('a caller with no credentials and a body that never ends is closed at the idle timeout', async () => {
    const result = await raw({ headers: grpcHeaders(), endStream: false });

    expect(result.ms).toBeLessThan(QUIET_MS);
  });
});

describe('native gRPC port - the log of a refused call', () => {
  /** The `REQUEST ERROR` lines of one native call sent with this `:authority` and no credentials. */
  const refusedWith = async (opts: { authority: string }) => {
    const log = spyOn(Logger.prototype, 'log');
    const session = connectHttp2(`http://${addressOf(application)}`);

    try {
      const stream = session.request({
        ':method': 'POST',
        ':path': '/greeter.v1.GreeterService/SayHello',
        ':authority': opts.authority,
        'content-type': 'application/grpc',
      });
      stream.resume();
      // One empty gRPC message: no flag, length 0.
      stream.end(Buffer.alloc(5));
      await new Promise<void>((resolve) => stream.once('close', () => resolve()));

      return log.mock.calls.filter(([, message]) => String(message).includes('REQUEST ERROR'));
    } finally {
      session.close();
      log.mockRestore();
    }
  };

  const PATH = '/api/grpc/greeter.v1.GreeterService/SayHello';

  test('names the host the caller used, at warn for a 401', async () => {
    const lines = await refusedWith({ authority: 'notes.example.com:50051' });

    expect(lines).toHaveLength(1);
    const [level, , , status, , url] = lines[0] ?? [];
    expect([String(level), status]).toEqual(['warn', 401]);
    expect(url).toBe(`grpc://notes.example.com:50051${PATH}`);
  });

  test('bounds the host and replaces what no host name carries', async () => {
    const lines = await refusedWith({ authority: `a!b$c;d=${'x'.repeat(1_000)}` });

    expect(lines).toHaveLength(1);
    const url = String(lines[0]?.[5]);
    expect(url).toBe(`grpc://a?b?c?d?${'x'.repeat(253)}${PATH}`);
  });
});

describe('native gRPC port - lifecycle', () => {
  test('off: no listener is bound', async () => {
    const off = await start(undefined);

    expect(
      off.get({ key: GrpcBindingKeys.GRPC_NATIVE_LISTENER, isOptional: true }),
    ).toBeUndefined();
    await off.stop();
  });

  for (const host of ['', undefined]) {
    test(`host ${JSON.stringify(host)} listens on loopback only`, async () => {
      const local = await start({ port: 0, host });

      expect(addressOf(local)).toStartWith('127.0.0.1:');
      await local.stop();
    });
  }

  test('stop() does not wait for a TCP connection that never finished the TLS handshake', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'ignis-grpc-handshake-'));
    const secure = await start({ port: 0, tls: certificate(folder), shutdownTimeout: 5_000 });
    const [host, port] = addressOf(secure).split(':');
    const socket = connectTcp({ host, port: Number(port) });
    const closed = new Promise<boolean>((resolve) => socket.once('close', () => resolve(true)));
    socket.on('error', () => {});
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const startedAt = performance.now();
    await secure.stop();
    const took = performance.now() - startedAt;
    const isClosed = await Promise.race([closed, Execution.sleep({ ms: 1_000 }).then(() => false)]);
    socket.destroy();
    rmSync(folder, { recursive: true, force: true });

    expect(took).toBeLessThan(2_000);
    expect(isClosed).toBe(true);
  });

  test('a second stop() waits for the same shutdown', async () => {
    const twice = await start({ port: 0, shutdownTimeout: 400 });
    const method: unknown = Reflect.get(client({ url: `http://${addressOf(twice)}` }), 'sayHello');

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    const failure = failureOf(method({ name: 'sleep:20000' }, { headers: SIGNED_IN }));
    await Execution.sleep({ ms: 200 });
    const listener = twice.get({ key: GrpcBindingKeys.GRPC_NATIVE_LISTENER });
    const first = listener.stop();
    const startedAt = performance.now();
    await listener.stop();
    const waited = performance.now() - startedAt;
    await first;
    await failure;
    await twice.stop();

    expect(waited).toBeGreaterThanOrEqual(300);
  });

  test('a port in use fails start()', async () => {
    const [, port] = addressOf(application).split(':');
    const second = new NativeApplication({ port: Number(port) });
    second.init();
    const [outcome] = await Promise.allSettled([second.start()]);

    expect(outcome.status).toBe('rejected');
    await second.stop();
  });

  test('stop() aborts a call still running after shutdownTimeout', async () => {
    const short = await start({ port: 0, shutdownTimeout: 300 });
    const method: unknown = Reflect.get(client({ url: `http://${addressOf(short)}` }), 'sayHello');

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    seen.aborted = 0;
    const pending: Promise<unknown> = method({ name: 'sleep:20000' }, { headers: SIGNED_IN });
    const failure = failureOf(pending);
    await Execution.sleep({ ms: 200 });
    const startedAt = performance.now();
    await short.stop();

    expect(performance.now() - startedAt).toBeLessThan(3_000);
    expect(seen.aborted).toBe(1);
    const result = await failure;
    expect(result.code).toBe(Code.Unavailable);
  });

  /** A Connect client of the application port, and one of its methods. */
  const httpMethod = (opts: { application: NativeApplication; name: string }) => {
    const transport = createConnectTransport({
      baseUrl: `http://127.0.0.1:${opts.application.getServerPort()}/api/grpc`,
      httpVersion: '1.1',
    });
    const method: unknown = Reflect.get(createClient(GreeterService, transport), opts.name);

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    return method;
  };

  /** Stops the application and answers how long it took. */
  const timedStop = async (opts: { application: NativeApplication }) => {
    const startedAt = performance.now();
    await opts.application.stop();

    return performance.now() - startedAt;
  };

  test('stop() with no call running does not wait on the application port', async () => {
    const idle = await start({ port: 0, shutdownTimeout: 5_000 });
    await httpMethod({ application: idle, name: 'sayHello' })(
      { name: 'a' },
      { headers: SIGNED_IN },
    );

    const took = await timedStop({ application: idle });
    expect(took).toBeLessThan(1_000);
  });

  test('stop() lets a call of the application port that ends in time answer', async () => {
    const patient = await start({ port: 0, shutdownTimeout: 3_000 });
    seen.aborted = 0;
    const pending: Promise<unknown> = httpMethod({ application: patient, name: 'sayHello' })(
      { name: 'sleep:300' },
      { headers: SIGNED_IN },
    );
    await Execution.sleep({ ms: 100 });
    const took = await timedStop({ application: patient });

    const answer = await pending;
    expect(answer).toHaveProperty('message', 'hello sleep:300 context=true');
    expect(seen.aborted).toBe(0);
    expect(took).toBeLessThan(2_000);
  });

  test('stop() aborts a call of the application port still running after shutdownTimeout', async () => {
    const short = await start({ port: 0, shutdownTimeout: 300 });
    seen.aborted = 0;
    const pending: Promise<unknown> = httpMethod({ application: short, name: 'sayHello' })(
      { name: 'sleep:4000' },
      { headers: SIGNED_IN },
    );
    const failure = failureOf(pending);
    await Execution.sleep({ ms: 100 });
    const took = await timedStop({ application: short });

    const result = await failure;
    expect(result.code).toBe(Code.Unavailable);
    expect(result.message).toContain('The server is shutting down');
    expect(seen.aborted).toBe(1);
    expect(took).toBeGreaterThanOrEqual(150);
    expect(took).toBeLessThan(2_000);
  }, 10_000);

  test('an abort listener of a handler does not inherit the frame stop() was called in', async () => {
    const both = await start({ port: 0, shutdownTimeout: 300 });
    seen.abortFrames = [];
    const method: unknown = Reflect.get(client({ url: `http://${addressOf(both)}` }), 'sayHello');

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    const calls = [
      failureOf(method({ name: 'sleep:5000' }, { headers: SIGNED_IN })),
      failureOf(
        httpMethod({ application: both, name: 'sayHello' })(
          { name: 'sleep:5000' },
          { headers: SIGNED_IN },
        ),
      ),
    ];
    await Execution.sleep({ ms: 100 });
    await Execution.run({
      mode: ExecutionModes.SYSTEM,
      reason: 'stop',
      task: () => both.stop(),
    });
    await Promise.all(calls);

    const root = { mode: ExecutionModes.SCOPED, values: {} };
    expect(seen.abortFrames).toEqual([root, root]);
  }, 10_000);

  test('both ports wait for their calls at the same time, not one after the other', async () => {
    const both = await start({ port: 0, shutdownTimeout: 1_000 });
    seen.aborted = 0;
    const method: unknown = Reflect.get(client({ url: `http://${addressOf(both)}` }), 'sayHello');

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    const native = failureOf(method({ name: 'sleep:5000' }, { headers: SIGNED_IN }));
    const http = failureOf(
      httpMethod({ application: both, name: 'sayHello' })(
        { name: 'sleep:5000' },
        { headers: SIGNED_IN },
      ),
    );
    await Execution.sleep({ ms: 200 });
    const took = await timedStop({ application: both });

    const failures = await Promise.all([native, http]);
    expect(failures.map((failure) => failure.code)).toEqual([Code.Unavailable, Code.Unavailable]);
    expect(seen.aborted).toBe(2);
    expect(took).toBeLessThan(1_700);
  }, 10_000);

  /** A client stream that sends one message, then stays quiet or sends one every 10 ms, until `done` aborts. */
  async function* sending(opts: { isBusy: boolean; done: AbortSignal }) {
    yield { name: 'a' };

    while (!opts.done.aborted) {
      // It rejects only when `done` aborts, which the loop reads.
      await Promise.allSettled([wait({ ms: opts.isBusy ? 10 : 60_000, signal: opts.done })]);

      if (!opts.done.aborted) {
        yield { name: 'b' };
      }
    }
  }

  const isStream = (answer: unknown): answer is AsyncIterable<unknown> =>
    typeof answer === 'object' && answer !== null && Symbol.asyncIterator in answer;

  /** Reads a call to its end, whether it answers one message or a stream of them. */
  const drain = async (answer: unknown) => {
    if (isStream(answer)) {
      for await (const _message of answer) {
        // read to the end
      }

      return;
    }

    await answer;
  };

  /** Starts one call on `port`, stops the application and answers how long that took and what the client read. */
  const stopDuring = async (opts: {
    port: 'application' | 'native';
    name: string;
    input: (done: AbortSignal) => unknown;
  }) => {
    const running = await start({ port: 0, shutdownTimeout: 400 });
    const done = new AbortController();
    const method: unknown =
      opts.port === 'native'
        ? Reflect.get(client({ url: `http://${addressOf(running)}` }), opts.name)
        : httpMethod({ application: running, name: opts.name });

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    const failure = failureOf(drain(method(opts.input(done.signal), { headers: SIGNED_IN })));
    await Execution.sleep({ ms: 200 });
    const stopping = timedStop({ application: running });
    const took = await Promise.race([stopping, Execution.sleep({ ms: 3_000 }).then(() => -1)]);
    const result = await Promise.race([
      failure,
      Execution.sleep({ ms: 1_000 }).then(() => undefined),
    ]);
    done.abort();

    return { took, result };
  };

  const clientStreams = [
    { port: 'application' as const, name: 'collect' },
    { port: 'native' as const, name: 'collect' },
    { port: 'native' as const, name: 'chat' },
  ];

  for (const stream of clientStreams) {
    for (const isBusy of [true, false]) {
      const kind = isBusy ? 'busy' : 'quiet';

      test(`stop() ends a ${kind} "${stream.name}" call of the ${stream.port} port at shutdownTimeout`, async () => {
        const { took, result } = await stopDuring({
          ...stream,
          input: (done) => sending({ isBusy, done }),
        });

        expect(took).toBeGreaterThanOrEqual(150);
        expect(took).toBeLessThan(1_000);
        expect(result?.code).toBe(Code.Unavailable);
        expect(result?.message).toContain('The server is shutting down');
      }, 10_000);
    }
  }

  for (const port of ['application', 'native'] as const) {
    test(`stop() ends a server stream of the ${port} port whose handler ignores rpc.signal`, async () => {
      const { took, result } = await stopDuring({
        port,
        name: 'listHellos',
        input: () => ({ name: '2500' }),
      });

      expect(took).toBeGreaterThanOrEqual(150);
      expect(took).toBeLessThan(1_800);
      expect(result?.code).toBe(Code.Unavailable);
    }, 10_000);
  }

  test('reading a client stream adds no abort listener per message', async () => {
    async function* many() {
      for (let index = 0; index < 200; index += 1) {
        yield { name: 'm' };
      }
    }

    const method = httpMethod({ application, name: 'collect' });
    const answer: unknown = await method(many(), { headers: SIGNED_IN });

    expect(String(Reflect.get(Object(answer), 'message')).split(',')).toHaveLength(200);
    // The one listener of the iterator, for all 200 reads.
    expect(seen.added).toBe(1);
  });

  for (const native of [
    { port: -1 },
    { port: 0, limits: { concurrentStreams: 0 } },
    { port: 0, shutdownTimeout: 0 },
    { port: 0, shutdownTimeout: 2 ** 31 },
    { port: 0, limits: { concurrentStreams: 2 ** 32 } },
    JSON.parse('{ "port": 0, "host": 123 }'),
    { port: 0, tls: { use: true as const, key: '', cert: '' } },
  ]) {
    test(`${JSON.stringify(native)} stops the boot`, async () => {
      const bad = new NativeApplication(native);
      bad.init();
      const [outcome] = await Promise.allSettled([bad.start()]);

      expect(outcome.status).toBe('rejected');
      await bad.stop();
    });
  }

  test('TLS serves a client that trusts the certificate', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'ignis-grpc-tls-'));
    const tls = certificate(folder);
    const { cert } = tls;
    const secure = await start({ port: 0, tls });
    const [, port] = addressOf(secure).split(':');
    const method: unknown = Reflect.get(
      client({ url: `https://localhost:${port}`, ca: cert }),
      'sayHello',
    );

    if (typeof method !== 'function') {
      throw getError({ message: 'no method' });
    }

    const answer: unknown = await method({ name: 'tls' }, { headers: SIGNED_IN });

    expect(answer).toHaveProperty('message', 'hello tls context=true');
    await secure.stop();
    rmSync(folder, { recursive: true, force: true });
  });
});
