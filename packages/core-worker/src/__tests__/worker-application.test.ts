import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { BaseRestController, controller, jsonResponse } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { z } from '@hono/zod-openapi';
import type { IWorkerMessageScope } from '@/applications/worker';
import { WorkerApplication } from '@/applications/worker';
import { BffEnvelope } from '@/envelope/encode';
import type {
  IBffErrorEnvelope,
  IBffRequestEnvelope,
  IBffResponseEnvelope,
} from '@/envelope/types';

/** Counts how many times the route handler actually ran, which is what a duplicate listener costs: a POST inserting two rows. */
let helloHandlerRunCount = 0;

@controller({ path: '/hello' })
class HelloController extends BaseRestController {
  constructor() {
    super({ scope: HelloController.name, path: '/hello' });
  }

  override binding() {
    this.defineRoute({
      configs: {
        method: HTTP.Methods.GET,
        path: '/',
        responses: jsonResponse({
          description: 'Greeting',
          schema: z.object({ message: z.string() }),
        }),
      },
      handler: context => {
        helloHandlerRunCount += 1;
        return context.json({ message: 'hello from the worker' }, 200);
      },
    });
  }
}

/**
 * A dedicated worker's global scope, not a `MessagePort`: its message queue is enabled when the
 * module script is EVALUATED, so an envelope is dispatched to whatever listeners exist at that
 * instant and is simply lost when there are none. A `MessagePort` buffers until `start()` instead,
 * and Bun auto-starts one - so no `MessageChannel` test can reproduce a dropped boot-time request.
 */
class FakeWorkerScope implements IWorkerMessageScope {
  readonly posted: unknown[] = [];
  private readonly listeners = new Set<(event: MessageEvent) => void>();

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  dispatch(envelope: unknown): void {
    for (const listener of [...this.listeners]) {
      listener({ data: envelope } as MessageEvent);
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Polls instead of racing a fixed delay: a passing run costs one tick, a failing one still ends. */
const waitFor = async (opts: { condition: () => boolean; timeoutMs: number }): Promise<boolean> => {
  const { condition, timeoutMs } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await sleep(5);
  }

  return condition();
};

class TestWorkerApplication extends WorkerApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: 'core-worker-worker-application-test',
      version: '0.0.0',
      description: 'Proves WorkerApplication.listen() round-trips a real MessagePort',
    };
  }

  preConfigure() {}
  postConfigure() {}
  staticConfigure() {}
  setupMiddlewares() {}

  override async initialize(): Promise<void> {
    this.controller(HelloController);
    await this.registerControllers();
  }
}

const buildConfigs = (): IApplicationConfigs => ({
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
});

describe('WorkerApplication.listen()', () => {
  test('a real MessagePort round-trips a request through app.fetch() and posts a response back', async () => {
    const app = new TestWorkerApplication({
      scope: 'TestWorkerApplication',
      config: buildConfigs(),
    });

    // A real `MessageChannel`/`MessagePort`, not a hand-rolled fake: what this covers is that
    // `listen()` accepts a genuine port and round-trips a request through it, against the real
    // event and transfer semantics a fake would let us assume. It does NOT prove the `start()` call
    // - Bun auto-starts a port on `addEventListener`, so the test still passes with that call
    // deleted, and nothing here can falsify it under this runtime.
    const { port1, port2 } = new MessageChannel();

    await app.listen({ scope: port1 });

    const received = new Promise<IBffResponseEnvelope>(resolve => {
      // Left uninferred deliberately: `MessagePort`'s own `addEventListener` overloads resolve to a
      // slightly different `MessageEvent` type than the ambient global one, and an explicit
      // annotation here forces a mismatch between the two that inference alone avoids.
      port2.addEventListener('message', event => {
        resolve(event.data as IBffResponseEnvelope);
      });
      port2.start();
    });

    const request = new Request('http://ignis.internal/hello');
    const envelope: IBffRequestEnvelope = await BffEnvelope.encodeRequest({
      request,
      id: 'worker-app-1',
    });
    port2.postMessage(envelope);

    const response = await received;

    expect(response.id).toBe('worker-app-1');
    expect(response.status).toBe(200);

    const body = JSON.parse(new TextDecoder().decode(response.body));
    expect(body).toEqual({ message: 'hello from the worker' });
  });
});

/** Boots as slowly as a real one does - `examples/browser-bff` spends ~350ms starting PGlite before `initialize()` resolves. */
class SlowBootWorkerApplication extends TestWorkerApplication {
  override async initialize(): Promise<void> {
    await sleep(50);
    await super.initialize();
  }
}

const buildRequestEnvelope = async (opts: { id: string }): Promise<IBffRequestEnvelope> => {
  return BffEnvelope.encodeRequest({
    request: new Request('http://ignis.internal/hello'),
    id: opts.id,
  });
};

describe('WorkerApplication.listen() - the boot window', () => {
  beforeEach(() => {
    helloHandlerRunCount = 0;
  });

  test('a request posted while initialize() is still booting is answered, not dropped', async () => {
    const app = new SlowBootWorkerApplication({
      scope: 'SlowBootWorkerApplication',
      config: buildConfigs(),
    });

    const scope = new FakeWorkerScope();
    const envelope = await buildRequestEnvelope({ id: 'boot-window-1' });

    // Deliberately not awaited: this is the window a UI's first request lands in, and the reason
    // `examples/browser-bff` hand-rolls a ready handshake and calls it a FRAMEWORK GAP.
    const listening = app.listen({ scope });
    scope.dispatch(envelope);

    await listening;

    expect(await waitFor({ condition: () => scope.posted.length > 0, timeoutMs: 500 })).toBe(true);

    const response = scope.posted[0] as IBffResponseEnvelope;
    expect(response.id).toBe('boot-window-1');
    expect(response.status).toBe(200);
    expect(JSON.parse(new TextDecoder().decode(response.body))).toEqual({
      message: 'hello from the worker',
    });
  });

  test('every request from the boot window is answered, not just the first', async () => {
    const app = new SlowBootWorkerApplication({
      scope: 'SlowBootWorkerApplication',
      config: buildConfigs(),
    });

    const scope = new FakeWorkerScope();
    const envelopes = await Promise.all([
      buildRequestEnvelope({ id: 'boot-window-a' }),
      buildRequestEnvelope({ id: 'boot-window-b' }),
      buildRequestEnvelope({ id: 'boot-window-c' }),
    ]);

    const listening = app.listen({ scope });
    for (const envelope of envelopes) {
      scope.dispatch(envelope);
    }

    await listening;

    expect(await waitFor({ condition: () => scope.posted.length === 3, timeoutMs: 500 })).toBe(
      true,
    );

    const answeredIds = (scope.posted as IBffResponseEnvelope[]).map(response => response.id);
    expect(answeredIds).toEqual(['boot-window-a', 'boot-window-b', 'boot-window-c']);
    expect(helloHandlerRunCount).toBe(3);
  });

  test('a request that arrives after a failed boot is answered with an error envelope', async () => {
    class FailingBootWorkerApplication extends TestWorkerApplication {
      override async initialize(): Promise<void> {
        await sleep(10);
        throw getError({ message: 'deliberate boot failure' });
      }
    }

    const app = new FailingBootWorkerApplication({
      scope: 'FailingBootWorkerApplication',
      config: buildConfigs(),
    });

    const scope = new FakeWorkerScope();
    const envelope = await buildRequestEnvelope({ id: 'failed-boot-1' });

    const listening = app.listen({ scope });
    scope.dispatch(envelope);

    let caught: unknown;
    try {
      await listening;
    } catch (error) {
      caught = error;
    }

    // The caller of `listen()` still hears the failure...
    expect(caught).toBeDefined();
    // ...and so does the UI, instead of waiting out the transport's full timeout.
    expect(await waitFor({ condition: () => scope.posted.length > 0, timeoutMs: 500 })).toBe(true);

    const errorEnvelope = scope.posted[0] as IBffErrorEnvelope;
    expect(errorEnvelope.id).toBe('failed-boot-1');
    expect(errorEnvelope.error.text).toContain('deliberate boot failure');
  });

  test('listen() twice attaches one listener, so an envelope runs its handler once', async () => {
    const app = new TestWorkerApplication({
      scope: 'TestWorkerApplication',
      config: buildConfigs(),
    });

    const scope = new FakeWorkerScope();

    // Vite HMR re-evaluating the worker module is the everyday trigger.
    await app.listen({ scope });
    await app.listen({ scope });

    expect(scope.listenerCount()).toBe(1);

    scope.dispatch(await buildRequestEnvelope({ id: 'idempotent-1' }));

    expect(await waitFor({ condition: () => scope.posted.length > 0, timeoutMs: 500 })).toBe(true);
    await sleep(50);

    expect(helloHandlerRunCount).toBe(1);
    expect(scope.posted).toHaveLength(1);
  });

  test('stop() drains the post-stop hooks and stops answering', async () => {
    const app = new TestWorkerApplication({
      scope: 'TestWorkerApplication',
      config: buildConfigs(),
    });

    let drainedIdentifiers: string[] = [];
    app.registerPostStopHook({
      identifier: 'test.datasource.close',
      hook: () => {
        drainedIdentifiers = [...drainedIdentifiers, 'test.datasource.close'];
      },
    });

    const scope = new FakeWorkerScope();
    await app.listen({ scope });
    await app.stop();

    // Without this the OPFS exclusive lock a PGlite datasource holds is never released, and the
    // next Worker fails with `NoModificationAllowedError` until a full page reload.
    expect(drainedIdentifiers).toEqual(['test.datasource.close']);

    scope.dispatch(await buildRequestEnvelope({ id: 'after-stop-1' }));
    await sleep(50);

    expect(scope.posted).toHaveLength(0);
    expect(helloHandlerRunCount).toBe(0);
  });

  test('a request still waiting on the boot when stop() runs is answered, not left hanging', async () => {
    const app = new SlowBootWorkerApplication({
      scope: 'SlowBootWorkerApplication',
      config: buildConfigs(),
    });

    const scope = new FakeWorkerScope();

    const listening = app.listen({ scope });
    scope.dispatch(await buildRequestEnvelope({ id: 'stopped-mid-boot-1' }));
    await app.stop();
    await listening;

    expect(await waitFor({ condition: () => scope.posted.length > 0, timeoutMs: 500 })).toBe(true);

    const errorEnvelope = scope.posted[0] as IBffErrorEnvelope;
    expect(errorEnvelope.id).toBe('stopped-mid-boot-1');
    expect(errorEnvelope.statusCode).toBe(HTTP.ResultCodes.RS_5.ServiceUnavailable);
    expect(helloHandlerRunCount).toBe(0);
  });
});

describe('WorkerApplication - a failure that escapes the HTTP layer', () => {
  test('the error envelope carries a 500-class status code, not a fabricated 400', async () => {
    const app = new TestWorkerApplication({
      scope: 'TestWorkerApplication',
      config: buildConfigs(),
    });

    const scope = new FakeWorkerScope();
    await app.listen({ scope });

    // `decodeRequest` throws on this before Hono ever sees it - the class of failure that produces
    // an error envelope at all. Nothing about it is a client's bad request.
    scope.dispatch({ id: 'escaped-1', method: 'GET', url: 'ignis.internal/hello', headers: [] });

    expect(await waitFor({ condition: () => scope.posted.length > 0, timeoutMs: 500 })).toBe(true);

    const errorEnvelope = scope.posted[0] as IBffErrorEnvelope;
    expect(errorEnvelope.id).toBe('escaped-1');
    expect(errorEnvelope.statusCode).toBe(HTTP.ResultCodes.RS_5.InternalServerError);
  });
});
