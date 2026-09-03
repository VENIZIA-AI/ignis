import { EventBus, EventDispatchRetry, EventHandlerTypes } from '@/base/events';
import type { IDomainEvent, IEventHandler, TEventHandlerReference } from '@/base/events';
import { Container } from '@/helpers/inversion/container';
import type { AnyType } from '@venizia/ignis-helpers/common';
import type { ILogger, TLogLevel } from '@venizia/ignis-helpers/core';
import { getError } from '@venizia/ignis-helpers/core';
import { describe, expect, test } from 'bun:test';

/** Records every call instead of asserting inline, so a test can inspect level/message/args after the fact. */
class RecordingLogger implements ILogger {
  readonly calls: Array<{ level: TLogLevel; message: string; args: AnyType[] }> = [];

  debug(message: string, ...args: AnyType[]): void {
    this.calls.push({ level: 'debug', message, args });
  }

  info(message: string, ...args: AnyType[]): void {
    this.calls.push({ level: 'info', message, args });
  }

  warn(message: string, ...args: AnyType[]): void {
    this.calls.push({ level: 'warn', message, args });
  }

  error(message: string, ...args: AnyType[]): void {
    this.calls.push({ level: 'error', message, args });
  }

  emerg(message: string, ...args: AnyType[]): void {
    this.calls.push({ level: 'emerg', message, args });
  }

  log(level: TLogLevel, message: string, ...args: AnyType[]): void {
    this.calls.push({ level, message, args });
  }

  for(_methodName: string): ILogger {
    return this;
  }
}

/** A stand-in handler: records every `handle` call, and throws `getError` for the first `failuresBeforeSuccess` calls. */
class RecordingHandler implements IEventHandler {
  readonly handleCalls: Array<{ event: IDomainEvent }> = [];
  private readonly identifier: string;
  private failuresBeforeSuccess: number;

  constructor(opts: { identifier: string; failuresBeforeSuccess?: number }) {
    this.identifier = opts.identifier;
    this.failuresBeforeSuccess = opts.failuresBeforeSuccess ?? 0;
  }

  getIdentifier(): string {
    return this.identifier;
  }

  async handle(opts: { event: IDomainEvent }): Promise<void> {
    this.handleCalls.push({ event: opts.event });

    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess -= 1;
      throw getError({ message: `[RecordingHandler:${this.identifier}] Forced failure` });
    }
  }
}

/** Sync-only counterpart to `RecordingHandler` - `handle` never returns a promise, exercising
 * `IEventHandler.handle`'s `ValueOrPromise<void>` return type and a SYNCHRONOUS throw through the
 * retry path rather than a rejected promise. */
class SyncRecordingHandler implements IEventHandler {
  readonly handleCalls: Array<{ event: IDomainEvent }> = [];
  private failuresBeforeSuccess: number;

  constructor(opts?: { failuresBeforeSuccess?: number }) {
    this.failuresBeforeSuccess = opts?.failuresBeforeSuccess ?? 0;
  }

  handle(opts: { event: IDomainEvent }): void {
    this.handleCalls.push({ event: opts.event });

    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess -= 1;
      throw getError({ message: '[SyncRecordingHandler] Forced synchronous failure' });
    }
  }
}

interface TestEventPayloadMap {
  testEvent: { value: number };
  otherEvent: { flag: boolean };
}

const HANDLER_KEY = 'events.test-handler';

/** Flushes the microtask queue AND any pending timers - `queueMicrotask` alone does not wait out the retry backoff sleeps. */
const flush = (opts?: { ms?: number }): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, opts?.ms ?? 0));
};

const buildBus = (): {
  bus: EventBus<TestEventPayloadMap>;
  container: Container;
  logger: RecordingLogger;
} => {
  const container = new Container({ scope: 'event-bus-test' });
  const bus = new EventBus<TestEventPayloadMap>({ scope: 'event-bus-test', container });
  const logger = new RecordingLogger();
  bus.logger = logger;
  return { bus, container, logger };
};

describe('EventBus - publish never blocks and never throws', () => {
  test('publish returns before the handler has run', () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A' });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });

    expect(handler.handleCalls).toHaveLength(0);
  });

  test('a throwing handler does not propagate to the publisher', () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A', failuresBeforeSuccess: 99 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    expect(() => bus.publish({ name: 'testEvent', payload: { value: 1 } })).not.toThrow();
  });

  test('publishing an unregistered name does not throw and logs at debug level', () => {
    const { bus, logger } = buildBus();

    expect(() => bus.publish({ name: 'otherEvent', payload: { flag: true } })).not.toThrow();

    const debugCalls = logger.calls.filter(call => call.level === 'debug');
    expect(debugCalls).toHaveLength(1);
    expect(debugCalls[0].message).toContain('No handler registered');
  });
});

describe('EventBus - default retry (no `retry` given) is unchanged from before jitter/per-registration retry: 3 attempts, exponential backoff', () => {
  test('a handler failing twice then succeeding is called exactly 3 times and the event is handled', async () => {
    const { bus, container, logger } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A', failuresBeforeSuccess: 2 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    bus.publish({ name: 'testEvent', payload: { value: 42 } });
    await flush({ ms: 1000 });

    expect(handler.handleCalls).toHaveLength(3);
    expect(handler.handleCalls[2].event.payload).toEqual({ value: 42 });
    expect(logger.calls.filter(call => call.level === 'error')).toHaveLength(0);
  });

  test('a handler failing every time is attempted exactly 3 times, then gives up with one log line', async () => {
    const { bus, container, logger } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A', failuresBeforeSuccess: 99 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    bus.publish({ name: 'testEvent', payload: { value: 7 }, traceId: 'trace-123' });
    await flush({ ms: 1000 });

    expect(handler.handleCalls).toHaveLength(3);

    const errorCalls = logger.calls.filter(call => call.level === 'error');
    expect(errorCalls).toHaveLength(1);

    const [errorCall] = errorCalls;
    expect(errorCall.message).toContain('Handler exhausted retries');
    expect(errorCall.args).toContain('testEvent');
    expect(errorCall.args).toContain('trace-123');
    expect(errorCall.args).toContain(3);
  });
});

describe('EventBus - handlers resolve through DI by binding key, not by reference', () => {
  test('rebinding the key between register and publish dispatches to the NEW handler', async () => {
    const { bus, container } = buildBus();
    const handlerA = new RecordingHandler({ identifier: 'A' });
    const handlerB = new RecordingHandler({ identifier: 'B' });

    container.bind({ key: HANDLER_KEY }).toValue(handlerA);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    // Rebind AFTER register, BEFORE publish - proves resolution happens at dispatch time.
    container.bind({ key: HANDLER_KEY }).toValue(handlerB);

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush();

    expect(handlerA.handleCalls).toHaveLength(0);
    expect(handlerB.handleCalls).toHaveLength(1);
  });
});

describe('EventBus - multiple handlers per event name', () => {
  test('register appends - a second registration does not drop the first', async () => {
    const { bus, container } = buildBus();
    const firstKey = 'events.first-handler';
    const secondKey = 'events.second-handler';
    const first = new RecordingHandler({ identifier: 'first' });
    const second = new RecordingHandler({ identifier: 'second' });

    container.bind({ key: firstKey }).toValue(first);
    container.bind({ key: secondKey }).toValue(second);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: firstKey },
    });
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: secondKey },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush();

    expect(first.handleCalls).toHaveLength(1);
    expect(second.handleCalls).toHaveLength(1);
  });
});

describe('EventBus - event shape', () => {
  test('occurredAt is a valid ISO 8601 string and traceId passes through when given', async () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A' });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    const before = Date.now();
    bus.publish({ name: 'testEvent', payload: { value: 1 }, traceId: 'trace-abc' });
    await flush();
    const after = Date.now();

    expect(handler.handleCalls).toHaveLength(1);
    const [{ event }] = handler.handleCalls;

    expect(event.traceId).toBe('trace-abc');
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
    const occurredAtMs = new Date(event.occurredAt).getTime();
    expect(occurredAtMs).toBeGreaterThanOrEqual(before);
    expect(occurredAtMs).toBeLessThanOrEqual(after);
  });

  test('traceId is undefined when not given', async () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A' });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush();

    expect(handler.handleCalls[0].event.traceId).toBeUndefined();
  });
});

describe('EventBus - type safety', () => {
  test('a wrong event name is a compile error', () => {
    const { bus } = buildBus();

    // @ts-expect-error - 'notAnEvent' is not a key of TestEventPayloadMap
    bus.publish({ name: 'notAnEvent', payload: { value: 1 } });

    expect(true).toBe(true);
  });

  test('a wrong payload shape is a compile error', () => {
    const { bus } = buildBus();

    // @ts-expect-error - testEvent's payload must be { value: number }, not { wrong: string }
    bus.publish({ name: 'testEvent', payload: { wrong: 'shape' } });

    expect(true).toBe(true);
  });
});

describe('EventBus - per-registration retry override', () => {
  test('retry: { maxAttempts: 5, baseDelayMs: 300 } really makes 5 attempts', async () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A', failuresBeforeSuccess: 4 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
      retry: { maxAttempts: 5, baseDelayMs: 300 },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush({ ms: 8000 });

    expect(handler.handleCalls).toHaveLength(5);
  }, 10000);

  test('two registrations on the same event name each honour their own retry settings', async () => {
    const { bus, container } = buildBus();
    const defaultKey = 'events.default-retry-handler';
    const customKey = 'events.custom-retry-handler';
    // Fails one more time than the default 3-attempt budget allows - proves it is NOT
    // borrowing the other registration's 5-attempt budget.
    const defaultHandler = new RecordingHandler({
      identifier: 'default',
      failuresBeforeSuccess: 3,
    });
    // Needs the full 5-attempt budget - proves it is NOT capped at the other registration's 3.
    const customHandler = new RecordingHandler({ identifier: 'custom', failuresBeforeSuccess: 4 });

    container.bind({ key: defaultKey }).toValue(defaultHandler);
    container.bind({ key: customKey }).toValue(customHandler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: defaultKey },
    });
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: customKey },
      retry: { maxAttempts: 5, baseDelayMs: 50 },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush({ ms: 3000 });

    // Default budget (3 attempts) is exhausted without ever succeeding.
    expect(defaultHandler.handleCalls).toHaveLength(3);
    // Custom budget (5 attempts) succeeds on the last one.
    expect(customHandler.handleCalls).toHaveLength(5);
  }, 8000);
});

describe('EventBus - retry is bounded: register() rejects loudly rather than clamp', () => {
  test('maxAttempts above the ceiling throws at register(), naming the ceiling', () => {
    const { bus } = buildBus();

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { maxAttempts: EventDispatchRetry.MAX_ATTEMPTS_CEILING + 1 },
      }),
    ).toThrow(
      new RegExp(
        `retry\\.maxAttempts exceeds the ceiling.*Ceiling: ${EventDispatchRetry.MAX_ATTEMPTS_CEILING}`,
      ),
    );
  });

  test('a total window above the ceiling throws at register() even when maxAttempts alone is legal', () => {
    const { bus } = buildBus();

    // maxAttempts: 6 is well under the ceiling (10), but exponential backoff from a 2000ms base
    // sums past MAX_TOTAL_WINDOW_MS (2000 + 4000 + 8000 + 16000 + 30000-capped = 60000ms).
    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { maxAttempts: 6, baseDelayMs: 2000 },
      }),
    ).toThrow(
      new RegExp(
        `retry window exceeds the ceiling.*Ceiling: ${EventDispatchRetry.MAX_TOTAL_WINDOW_MS}ms`,
      ),
    );
  });

  test('zero, negative, and non-integer maxAttempts all throw at register()', () => {
    const { bus } = buildBus();

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { maxAttempts: 0 },
      }),
    ).toThrow(/retry\.maxAttempts must be a positive integer/);

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { maxAttempts: -1 },
      }),
    ).toThrow(/retry\.maxAttempts must be a positive integer/);

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { maxAttempts: 1.5 },
      }),
    ).toThrow(/retry\.maxAttempts must be a positive integer/);
  });

  test('zero, negative, and non-integer baseDelayMs all throw at register()', () => {
    const { bus } = buildBus();

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { baseDelayMs: 0 },
      }),
    ).toThrow(/retry\.baseDelayMs must be a positive integer/);

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { baseDelayMs: -10 },
      }),
    ).toThrow(/retry\.baseDelayMs must be a positive integer/);

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
        retry: { baseDelayMs: 2.5 },
      }),
    ).toThrow(/retry\.baseDelayMs must be a positive integer/);
  });
});

describe('EventBus - jitter is always applied, never a knob', () => {
  test('the backoff delay actually used is not the bare exponential value', async () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A', failuresBeforeSuccess: 2 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    const originalRandom = Math.random;
    const originalSetTimeout = globalThis.setTimeout;
    const observedDelaysMs: number[] = [];

    // Pinned so FULL jitter's `Math.floor(Math.random() * delay)` is deterministic: bare exponential
    // delays are 100ms then 200ms (default EventDispatchRetry); jittered they become 50ms then 100ms.
    Math.random = () => 0.5;
    globalThis.setTimeout = ((callback: AnyType, delay?: number, ...args: AnyType[]) => {
      if (typeof delay === 'number') {
        observedDelaysMs.push(delay);
      }
      return originalSetTimeout(callback, delay, ...args);
    }) as AnyType;

    try {
      bus.publish({ name: 'testEvent', payload: { value: 1 } });
      await flush({ ms: 1000 });
    } finally {
      Math.random = originalRandom;
      globalThis.setTimeout = originalSetTimeout;
    }

    expect(handler.handleCalls).toHaveLength(3);
    expect(observedDelaysMs).toContain(50);
    expect(observedDelaysMs).toContain(100);
    // 200ms is what attempt 2's delay would be WITHOUT jitter - it must never appear.
    expect(observedDelaysMs).not.toContain(200);
  });
});

describe('EventBus - handler shapes: binding key vs function', () => {
  test('a binding-key handler dispatches and receives the event', async () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A' });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    bus.publish({ name: 'testEvent', payload: { value: 5 } });
    await flush();

    expect(handler.handleCalls).toHaveLength(1);
    expect(handler.handleCalls[0].event.payload).toEqual({ value: 5 });
  });

  test('a function handler dispatches and receives the event', async () => {
    const { bus } = buildBus();
    const calls: Array<{ event: IDomainEvent }> = [];

    bus.register({
      name: 'testEvent',
      handler: {
        type: EventHandlerTypes.FUNCTION,
        fn: async fnOpts => {
          calls.push({ event: fnOpts.event });
        },
      },
    });

    bus.publish({ name: 'testEvent', payload: { value: 9 } });
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].event.payload).toEqual({ value: 9 });
  });

  test('a binding-key handler picks up a rebind between retry attempts', async () => {
    const { bus, container } = buildBus();
    const originalHandlerCalls: Array<{ event: IDomainEvent }> = [];
    const reboundHandler = new RecordingHandler({ identifier: 'rebound' });
    const rebindKey = 'events.rebind-between-attempts';

    container.bind({ key: rebindKey }).toValue({
      async handle(handleOpts: { event: IDomainEvent }): Promise<void> {
        originalHandlerCalls.push({ event: handleOpts.event });
        // Rebinds itself from INSIDE attempt 1, before attempt 1 even fails - proves attempt 2
        // re-resolves the container rather than reusing a captured reference.
        container.bind({ key: rebindKey }).toValue(reboundHandler);
        throw getError({ message: '[originalHandler] Forced failure to trigger the rebind' });
      },
    });

    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: rebindKey },
      retry: { maxAttempts: 2, baseDelayMs: 20 },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush({ ms: 1000 });

    // Attempt 1 hit the original binding (and rebound it); attempt 2 resolved the NEW binding.
    expect(originalHandlerCalls).toHaveLength(1);
    expect(reboundHandler.handleCalls).toHaveLength(1);
  });

  test('a function handler does NOT pick up a rebind - it is a captured closure', async () => {
    const { bus } = buildBus();
    const calls: Array<{ event: IDomainEvent }> = [];
    let hasFailedOnce = false;

    const inlineHandler = async (fnOpts: { event: IDomainEvent }): Promise<void> => {
      calls.push({ event: fnOpts.event });
      if (!hasFailedOnce) {
        hasFailedOnce = true;
        throw getError({ message: '[inlineHandler] Forced failure' });
      }
    };

    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.FUNCTION, fn: inlineHandler },
      retry: { maxAttempts: 2, baseDelayMs: 20 },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush({ ms: 1000 });

    // There is no key to rebind - both attempts necessarily ran the SAME captured closure.
    expect(calls).toHaveLength(2);
  });
});

describe('EventBus - the handler union discriminates on type AND field name', () => {
  test('a mismatched type/field pair is a compile error', () => {
    const bindingKeyWithFn: TEventHandlerReference<{ value: number }> = {
      type: EventHandlerTypes.BINDING_KEY,
      // @ts-expect-error - BINDING_KEY must carry `key`, not `fn`
      fn: async () => {},
    };

    const functionWithKey: TEventHandlerReference<{ value: number }> = {
      type: EventHandlerTypes.FUNCTION,
      // @ts-expect-error - FUNCTION must carry `fn`, not `key`
      key: 'some-key',
    };

    expect(bindingKeyWithFn).toBeDefined();
    expect(functionWithKey).toBeDefined();
  });
});

describe('EventBus - invalid handler shapes throw at register()', () => {
  test('an unknown handler.type throws, naming what arrived', () => {
    const { bus } = buildBus();

    expect(() =>
      bus.register({
        name: 'testEvent',
        // @ts-expect-error - 'not-a-real-type' is not a valid EventHandlerTypes value
        handler: { type: 'not-a-real-type', key: HANDLER_KEY },
      }),
    ).toThrow(/Unknown handler\.type/);
  });

  test('an empty handler.key throws', () => {
    const { bus } = buildBus();

    expect(() =>
      bus.register({
        name: 'testEvent',
        handler: { type: EventHandlerTypes.BINDING_KEY, key: '' },
      }),
    ).toThrow(/Invalid handler\.key/);
  });

  test('a non-function handler.fn throws', () => {
    const { bus } = buildBus();

    expect(() =>
      bus.register({
        name: 'testEvent',
        // @ts-expect-error - fn must be a function, not a string
        handler: { type: EventHandlerTypes.FUNCTION, fn: 'not-a-function' },
      }),
    ).toThrow(/Invalid handler\.fn/);
  });

  test('null or an empty handler object throws', () => {
    const { bus } = buildBus();

    expect(() =>
      bus.register({
        name: 'testEvent',
        // @ts-expect-error - null is not a valid TEventHandlerReference
        handler: null,
      }),
    ).toThrow(/Invalid handler/);

    expect(() =>
      bus.register({
        name: 'testEvent',
        // @ts-expect-error - {} is not a valid TEventHandlerReference
        handler: {},
      }),
    ).toThrow(/Invalid handler/);
  });
});

describe('EventBus - synchronous handlers', () => {
  test('a synchronous handler that throws is retried and, on exhaustion, logged the same as an async one', async () => {
    const { bus, container, logger } = buildBus();
    const handler = new SyncRecordingHandler({ failuresBeforeSuccess: 99 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 }, traceId: 'trace-sync' });
    await flush({ ms: 1000 });

    expect(handler.handleCalls).toHaveLength(3);

    const errorCalls = logger.calls.filter(call => call.level === 'error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0].message).toContain('Handler exhausted retries');
    expect(errorCalls[0].args).toContain('trace-sync');
    expect(errorCalls[0].args).toContain(3);
  });

  test('a synchronous handler that succeeds still dispatches exactly once', async () => {
    const { bus, container } = buildBus();
    const handler = new SyncRecordingHandler();
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({
      name: 'testEvent',
      handler: { type: EventHandlerTypes.BINDING_KEY, key: HANDLER_KEY },
    });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });
    await flush();

    expect(handler.handleCalls).toHaveLength(1);
  });
});
