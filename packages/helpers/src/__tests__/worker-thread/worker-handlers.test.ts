/** BaseWorkerHelper / BaseWorkerBusHelper event-handler Test Suite */

import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import {
  BaseWorkerBusHelper,
  BaseWorkerHelper,
  BaseWorkerMessageBusHandlerHelper,
  BaseWorkerThreadHelper,
} from '@/modules/worker-thread';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { MessagePort } from 'node:worker_threads';

/** Keeps the thread alive until the test terminates it, so 'exit' never races the assertions. */
const IDLE_WORKER_SOURCE = 'setInterval(() => {}, 60_000);';

const workers: BaseWorkerHelper<unknown>[] = [];

const createWorkerHelper = (opts: {
  eventHandlers?: ConstructorParameters<typeof BaseWorkerHelper>[0]['eventHandlers'];
}) => {
  const helper = new BaseWorkerHelper<unknown>({
    identifier: 'test-worker',
    path: IDLE_WORKER_SOURCE,
    options: { eval: true },
    eventHandlers: opts.eventHandlers,
  });

  workers.push(helper);
  return helper;
};

/** MessagePort is a native class - a structural EventEmitter stand-in exercises the same listeners. */
const createFakePort = () => {
  const port: AnyType = new EventEmitter();
  port.postMessage = mock(() => {});

  return port as EventEmitter & {
    postMessage: ReturnType<typeof mock>;
  };
};

const asMessagePort = (port: ReturnType<typeof createFakePort>) => port as AnyType as MessagePort;

afterEach(async () => {
  while (workers.length) {
    const helper = workers.pop();
    await helper?.worker?.terminate();
  }
});

describe('BaseWorkerHelper | event binding', () => {
  test('dispatches worker events to the registered handlers', () => {
    const onMessage = mock(() => {});
    const onError = mock(() => {});
    const onMessageError = mock(() => {});
    const helper = createWorkerHelper({ eventHandlers: { onMessage, onError, onMessageError } });

    helper.worker.emit('message', { hello: 'world' });
    helper.worker.emit('error', getError({ message: 'worker boom' }));
    helper.worker.emit('messageerror', getError({ message: 'decode boom' }));

    expect(onMessage).toHaveBeenCalledWith({ message: { hello: 'world' } });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onMessageError).toHaveBeenCalledTimes(1);
  });

  test('falls back to logging when no handler is registered', () => {
    const helper = createWorkerHelper({});

    expect(() => helper.worker.emit('message', { hello: 'world' })).not.toThrow();
    expect(() => helper.worker.emit('exit', 0)).not.toThrow();
  });

  test('a synchronously throwing onMessage handler does not escape the worker listener', () => {
    const helper = createWorkerHelper({
      eventHandlers: {
        onMessage: () => {
          throw getError({ message: 'sync onMessage boom' });
        },
      },
    });

    expect(() => helper.worker.emit('message', { hello: 'world' })).not.toThrow();
  });

  test('a synchronously throwing onError handler does not escape the worker listener', () => {
    const helper = createWorkerHelper({
      eventHandlers: {
        onError: () => {
          throw getError({ message: 'sync onError boom' });
        },
      },
    });

    expect(() => helper.worker.emit('error', getError({ message: 'worker boom' }))).not.toThrow();
  });

  test('a synchronously throwing onOnline handler does not escape the worker listener', () => {
    const helper = createWorkerHelper({
      eventHandlers: {
        onOnline: () => {
          throw getError({ message: 'sync onOnline boom' });
        },
      },
    });

    expect(() => helper.worker.emit('online')).not.toThrow();
  });

  test('a synchronously throwing onExit handler does not escape the worker listener', () => {
    const helper = createWorkerHelper({
      eventHandlers: {
        onExit: () => {
          throw getError({ message: 'sync onExit boom' });
        },
      },
    });

    expect(() => helper.worker.emit('exit', 1)).not.toThrow();
  });

  test('a synchronously throwing onMessageError handler does not escape the worker listener', () => {
    const helper = createWorkerHelper({
      eventHandlers: {
        onMessageError: () => {
          throw getError({ message: 'sync onMessageError boom' });
        },
      },
    });

    expect(() =>
      helper.worker.emit('messageerror', getError({ message: 'decode boom' })),
    ).not.toThrow();
  });

  test('a rejecting async handler does not escape the worker listener', () => {
    const helper = createWorkerHelper({
      eventHandlers: {
        onMessage: () => Promise.reject(getError({ message: 'async onMessage boom' })),
      },
    });

    expect(() => helper.worker.emit('message', { hello: 'world' })).not.toThrow();
  });

  test('runs a real worker end to end: online then exit', async () => {
    const onOnline = mock(() => {});
    const onExit = mock(() => {});

    const helper = new BaseWorkerHelper<unknown>({
      identifier: 'lifecycle-worker',
      path: IDLE_WORKER_SOURCE,
      options: { eval: true },
      eventHandlers: { onOnline, onExit },
    });

    await new Promise<void>(resolve => {
      helper.worker.on('online', () => {
        resolve();
      });
    });
    expect(onOnline).toHaveBeenCalledTimes(1);

    const exited = new Promise<void>(resolve => {
      helper.worker.on('exit', () => {
        resolve();
      });
    });
    await helper.worker.terminate();
    await exited;

    expect(onExit).toHaveBeenCalledTimes(1);
  }, 5_000);
});

describe('BaseWorkerBusHelper | port binding', () => {
  test('dispatches port events to the bus handler', () => {
    const onMessage = mock(() => {});
    const onError = mock(() => {});
    const onExit = mock(() => {});
    const onClose = mock(() => {});
    const port = createFakePort();

    const bus = new BaseWorkerBusHelper<unknown, unknown>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage,
        onError,
        onExit,
        onClose,
      }),
    });

    expect(bus.port).toBe(asMessagePort(port));

    port.emit('message', { hello: 'world' });
    port.emit('error', getError({ message: 'port boom' }));
    port.emit('exit', 1);
    port.emit('close');

    expect(onMessage).toHaveBeenCalledWith({ message: { hello: 'world' } });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith({ exitCode: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('routes messageerror through onError', () => {
    const onError = mock(() => {});
    const port = createFakePort();

    new BaseWorkerBusHelper<unknown, unknown>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage: () => {},
        onError,
      }),
    });

    port.emit('messageerror', getError({ message: 'decode boom' }));

    expect(onError).toHaveBeenCalledTimes(1);
  });

  test('a synchronously throwing onMessage handler does not escape the port listener', () => {
    const port = createFakePort();

    new BaseWorkerBusHelper<unknown, unknown>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage: () => {
          throw getError({ message: 'sync bus onMessage boom' });
        },
      }),
    });

    expect(() => port.emit('message', { hello: 'world' })).not.toThrow();
  });

  test('a synchronously throwing onError handler does not escape the port listener', () => {
    const port = createFakePort();

    new BaseWorkerBusHelper<unknown, unknown>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage: () => {},
        onError: () => {
          throw getError({ message: 'sync bus onError boom' });
        },
      }),
    });

    expect(() => port.emit('error', getError({ message: 'port boom' }))).not.toThrow();
  });

  test('a synchronously throwing onClose handler does not escape the port listener', () => {
    const port = createFakePort();

    new BaseWorkerBusHelper<unknown, unknown>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage: () => {},
        onClose: () => {
          throw getError({ message: 'sync bus onClose boom' });
        },
      }),
    });

    expect(() => port.emit('close')).not.toThrow();
  });

  test('a rejecting async onMessage handler does not escape the port listener', () => {
    const port = createFakePort();

    new BaseWorkerBusHelper<unknown, unknown>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage: () => Promise.reject(getError({ message: 'async bus onMessage boom' })),
      }),
    });

    expect(() => port.emit('message', { hello: 'world' })).not.toThrow();
  });
});

describe('BaseWorkerBusHelper | postMessage', () => {
  test('posts the message and invokes the before/after hooks', async () => {
    const port = createFakePort();
    const bus = new BaseWorkerBusHelper<unknown, { value: number }>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage: () => {},
      }),
    });

    const onBeforePostMessage = mock(() => {});
    const onAfterPostMessage = mock(() => {});
    bus.onBeforePostMessage = onBeforePostMessage;
    bus.onAfterPostMessage = onAfterPostMessage;

    await bus.postMessage({ message: { value: 1 }, transferList: undefined });

    expect(port.postMessage).toHaveBeenCalledWith({ value: 1 });
    expect(onBeforePostMessage).toHaveBeenCalledTimes(1);
    expect(onAfterPostMessage).toHaveBeenCalledTimes(1);
  });

  test('a synchronously throwing onBeforePostMessage hook does not block the post', () => {
    const port = createFakePort();
    const bus = new BaseWorkerBusHelper<unknown, { value: number }>({
      scope: 'test-bus',
      port: asMessagePort(port),
      busHandler: new BaseWorkerMessageBusHandlerHelper<unknown>({
        scope: 'test-bus-handler',
        onMessage: () => {},
      }),
    });

    bus.onBeforePostMessage = () => {
      throw getError({ message: 'sync onBeforePostMessage boom' });
    };

    expect(() => bus.postMessage({ message: { value: 1 }, transferList: undefined })).not.toThrow();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('BaseWorkerThreadHelper', () => {
  test('refuses to start in the main thread', () => {
    expect(() => new BaseWorkerThreadHelper({ scope: 'main-thread' })).toThrow(
      /Cannot start worker in MAIN_THREAD/,
    );
  });
});
