import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { fileDesc, serviceDesc } from '@bufbuild/protobuf/codegenv2';
import { HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError, PromiseUtility } from '@venizia/ignis-helpers/core';
import {
  AuthenticationStrategyRegistry,
  bidiStream,
  clientStream,
  serverStream,
  unary,
  Container,
  ControllerTransports,
} from '@venizia/ignis-kernel';
import type { IApplicationInfo, IAuthenticationStrategy, TContext } from '@venizia/ignis-kernel';
import type { HandlerContext } from '@connectrpc/connect';
import { BaseApplication } from '@/base/applications';
import { BaseGrpcController } from '@/base/controllers/grpc/base';
import { controller, useRequestContext } from '@/base/metadata';

/** `greeter.v1.GreeterService`: unary `SayHello`, `ListHellos` (server), `Collect` (client), `Chat` (bidi). */
const GreeterService = serviceDesc(
  fileDesc(
    'Cg1ncmVldGVyLnByb3RvEgpncmVldGVyLnYxIi4KDEhlbGxvUmVxdWVzdBIMCgRuYW1lGAEgASgJEhAKCHNsZWVwX21zGAIgASgFIiAKDUhlbGxvUmVzcG9uc2USDwoHbWVzc2FnZRgBIAEoCTKZAgoOR3JlZXRlclNlcnZpY2USPwoIU2F5SGVsbG8SGC5ncmVldGVyLnYxLkhlbGxvUmVxdWVzdBoZLmdyZWV0ZXIudjEuSGVsbG9SZXNwb25zZRJDCgpMaXN0SGVsbG9zEhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UwARJACgdDb2xsZWN0EhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UoARI/CgRDaGF0EhguZ3JlZXRlci52MS5IZWxsb1JlcXVlc3QaGS5ncmVldGVyLnYxLkhlbGxvUmVzcG9uc2UoATABYgZwcm90bzM',
  ),
  0,
);

const KEY = 'x-stream-key';

class StreamKeyStrategy implements IAuthenticationStrategy {
  name = KEY;

  async authenticate(context: TContext) {
    if (context.req.header(KEY) !== 'ok') {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.Unauthorized, message: 'Bad key' });
    }

    return { userId: 'u1', principalType: 'user' };
  }
}

AuthenticationStrategyRegistry.getInstance().register({
  container: new Container({ scope: 'grpc-stream-strategies' }),
  strategies: [{ name: KEY, strategy: StreamKeyStrategy }],
});

const GATE = { authenticate: { strategies: [KEY] } };

/** What the handlers saw, read by the tests. */
const seen: { received: string[]; started: number; released: string[] } = {
  received: [],
  started: 0,
  released: [],
};

const nameOf = (request: unknown) => String(Reflect.get(Object(request), 'name'));

@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterService })
class GreeterController extends BaseGrpcController {
  constructor() {
    super({ scope: 'GreeterController' });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello', ...GATE } })
  async sayHello(opts: { request: unknown }) {
    await PromiseUtility.sleep({ ms: Number(nameOf(opts.request)) });

    return { message: 'done' };
  }

  @serverStream({ configs: { name: 'listHellos', ...GATE } })
  async *listHellos(opts: { request: unknown; rpc: HandlerContext }) {
    seen.started += 1;

    if (nameOf(opts.request) === 'forever') {
      opts.rpc.signal.addEventListener('abort', () => seen.released.push('signal'));

      try {
        for (;;) {
          yield { message: 'again' };
        }
      } finally {
        seen.released.push('finally');
      }
    }

    opts.rpc.responseTrailer.set('x-count', '2');
    const hasContext = useRequestContext() !== undefined;
    yield { message: `first context=${hasContext}` };

    if (nameOf(opts.request) === 'fail') {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.Conflict, message: 'Changed meanwhile' });
    }

    await PromiseUtility.sleep({ ms: Number(nameOf(opts.request)) });
    yield { message: `second context=${useRequestContext() !== undefined}` };
  }

  @clientStream({ configs: { name: 'collect', ...GATE } })
  async collect(opts: { request: AsyncIterable<unknown> }) {
    seen.started += 1;

    for await (const message of opts.request) {
      seen.received.push(nameOf(message));
    }

    return { message: seen.received.join(',') };
  }

  @bidiStream({ configs: { name: 'chat', ...GATE } })
  async *chat(opts: { request: AsyncIterable<unknown> }) {
    for await (const message of opts.request) {
      yield { message: nameOf(message) };
    }
  }
}

/** The same server stream with no gate: a public method. */
@controller({ path: '/open', transport: ControllerTransports.GRPC, service: GreeterService })
class OpenController extends BaseGrpcController {
  constructor() {
    super({ scope: 'OpenController' });
  }

  override binding() {}

  @serverStream({ configs: { name: 'listHellos' } })
  async *listHellos(opts: { request: unknown }) {
    yield { message: 'first' };
    await PromiseUtility.sleep({ ms: Number(nameOf(opts.request)) });
    yield { message: 'second' };
  }
}

const IDLE_SECONDS = 1;
/** Longer than the idle timeout by more than Bun's timer granularity. */
const QUIET_MS = 6_000;
const MAX_BODY = 2_000;

class StreamApplication extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'grpc-stream', version: '0.0.0', description: 'gRPC streaming' };
  }

  override staticConfigure() {}

  override preConfigure() {
    this.controller(GreeterController);
    this.controller(OpenController);
  }

  override postConfigure() {}

  override setupMiddlewares() {}
}

const application = new StreamApplication({
  scope: 'StreamApplication',
  config: {
    host: '127.0.0.1',
    port: 0,
    path: { base: '/api', isStrict: false },
    transports: [ControllerTransports.REST, ControllerTransports.GRPC],
    asyncContext: { enable: true },
    server: { idleTimeout: IDLE_SECONDS, maxRequestBodySize: MAX_BODY },
  },
});

beforeAll(async () => {
  application.init();
  await application.start();
});

afterAll(async () => {
  await application.stop();
});

/** One Connect streaming envelope: a flags byte, the length, the JSON message. */
const envelope = (message: object) => {
  const data = new TextEncoder().encode(JSON.stringify(message));
  const frame = new Uint8Array(5 + data.length);
  new DataView(frame.buffer).setUint32(1, data.length);
  frame.set(data, 5);

  return frame;
};

/** The messages of a Connect streaming answer, and its end frame. */
const readStream = async (response: Response) => {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const messages: unknown[] = [];
  let end: unknown;

  for (let at = 0; at < bytes.length;) {
    const length = new DataView(buffer).getUint32(at + 1);
    const value: unknown = JSON.parse(
      new TextDecoder().decode(bytes.slice(at + 5, at + 5 + length)),
    );

    if (bytes[at] === 2) {
      end = value;
    } else {
      messages.push(value);
    }

    at += 5 + length;
  }

  return { status: response.status, messages, end };
};

const send = (opts: {
  path: string;
  body: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;
  headers?: Record<string, string>;
}) => {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/connect+json', ...opts.headers },
    body: opts.body,
    duplex: 'half',
  };

  return fetch(`http://${application.getServerAddress()}/api${opts.path}`, init);
};

const method = (name: string) => `/grpc/greeter.v1.GreeterService/${name}`;
const SIGNED_IN = { [KEY]: 'ok' };

const listHellos = async (opts: {
  name: string;
  headers?: Record<string, string>;
  path?: string;
}) => {
  const response = await send({
    path: opts.path ?? method('ListHellos'),
    body: envelope({ name: opts.name }),
    headers: opts.headers,
  });

  return readStream(response);
};

/** A request body that sends one message, waits, and sends a second. */
const paced = (opts: { pauseMs: number; onPause?: () => void }) => {
  return new ReadableStream<Uint8Array>({
    async start(source) {
      source.enqueue(envelope({ name: 'a' }));
      await PromiseUtility.sleep({ ms: opts.pauseMs });
      opts.onPause?.();
      source.enqueue(envelope({ name: 'b' }));
      source.close();
    },
  });
};

describe('gRPC streaming on the application port', () => {
  test('a server stream answers every message, its trailers, and keeps the request context', async () => {
    const result = await listHellos({ name: '0', headers: SIGNED_IN });

    expect(result.messages).toEqual([
      { message: 'first context=true' },
      { message: 'second context=true' },
    ]);
    expect(result.end).toEqual({ metadata: { 'x-count': ['2'] } });
  });

  test('a failure after the first message ends the stream with its code', async () => {
    const result = await listHellos({ name: 'fail', headers: SIGNED_IN });

    expect(result.messages).toHaveLength(1);
    expect(result.end).toHaveProperty('error', { code: 'aborted', message: 'Changed meanwhile' });
  });

  test('a client that leaves a server stream aborts rpc.signal and ends the generator', async () => {
    seen.released = [];
    const abort = new AbortController();
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/connect+json', ...SIGNED_IN },
      body: envelope({ name: 'forever' }),
      signal: abort.signal,
    };
    const response = await fetch(
      `http://${application.getServerAddress()}/api${method('ListHellos')}`,
      init,
    );
    await response.body?.getReader().read();
    abort.abort();
    await PromiseUtility.sleep({ ms: 500 });

    expect(seen.released).toEqual(['signal', 'finally']);
  });

  test('a client stream hands the handler each message as it arrives', async () => {
    seen.received = [];
    let atPause: string[] = [];
    const response = await send({
      path: method('Collect'),
      headers: SIGNED_IN,
      body: paced({ pauseMs: 300, onPause: () => (atPause = [...seen.received]) }),
    });
    const result = await readStream(response);

    expect(atPause).toEqual(['a']);
    expect(result.messages).toEqual([{ message: 'a,b' }]);
  });

  test('bidi is refused on HTTP/1.1', async () => {
    const response = await send({
      path: method('Chat'),
      headers: SIGNED_IN,
      body: envelope({ name: 'a' }),
    });

    expect(response.status).toBe(HTTP.ResultCodes.RS_5.HTTPVersionNotSupported);
  });

  test('a client stream over the body cap of the server is refused', async () => {
    const response = await send({
      path: method('Collect'),
      headers: SIGNED_IN,
      body: envelope({ name: 'x'.repeat(MAX_BODY) }),
    });
    await response.arrayBuffer();

    expect(response.status).toBe(HTTP.ResultCodes.RS_4.ContentTooLarge);
  });

  test('a caller with no credentials is refused before a message is read', async () => {
    seen.started = 0;
    const startedAt = performance.now();
    const response = await send({ path: method('Collect'), body: paced({ pauseMs: QUIET_MS }) });
    const result = await readStream(response);

    expect(result.end).toHaveProperty('error.code', 'unauthenticated');
    expect(seen.started).toBe(0);
    expect(performance.now() - startedAt).toBeLessThan(QUIET_MS);
  }, 20_000);

  test('a signed-in client stream may pause longer than the idle timeout', async () => {
    seen.received = [];
    const response = await send({
      path: method('Collect'),
      headers: SIGNED_IN,
      body: paced({ pauseMs: QUIET_MS }),
    });
    const result = await readStream(response);

    expect(result.messages).toEqual([{ message: 'a,b' }]);
  }, 20_000);

  test('a signed-in server stream and unary call may stay quiet longer than the idle timeout', async () => {
    const [stream, response] = await Promise.all([
      listHellos({ name: String(QUIET_MS), headers: SIGNED_IN }),
      send({
        path: method('SayHello'),
        body: new TextEncoder().encode(JSON.stringify({ name: String(QUIET_MS) })),
        headers: { ...SIGNED_IN, 'content-type': 'application/json' },
      }),
    ]);
    const body = await response.json();

    expect(stream.messages).toHaveLength(2);
    expect(body).toEqual({ message: 'done' });
  }, 20_000);

  test('a public stream keeps the idle timeout', async () => {
    const task = listHellos({
      name: String(QUIET_MS),
      path: '/open/greeter.v1.GreeterService/ListHellos',
    });
    const [outcome] = await Promise.allSettled([task]);

    expect(outcome.status).toBe('rejected');
  }, 20_000);
});
