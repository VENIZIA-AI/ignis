import { EventBus } from '@/base/events';
import type { IDomainEvent, IEventHandler } from '@/base/events';
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
    bus.register({ name: 'testEvent', handlerBindingKey: HANDLER_KEY });

    bus.publish({ name: 'testEvent', payload: { value: 1 } });

    expect(handler.handleCalls).toHaveLength(0);
  });

  test('a throwing handler does not propagate to the publisher', () => {
    const { bus, container } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A', failuresBeforeSuccess: 99 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({ name: 'testEvent', handlerBindingKey: HANDLER_KEY });

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

describe('EventBus - retry is fixed at 3 attempts / exponential backoff, no knob', () => {
  test('a handler failing twice then succeeding is called exactly 3 times and the event is handled', async () => {
    const { bus, container, logger } = buildBus();
    const handler = new RecordingHandler({ identifier: 'A', failuresBeforeSuccess: 2 });
    container.bind({ key: HANDLER_KEY }).toValue(handler);
    bus.register({ name: 'testEvent', handlerBindingKey: HANDLER_KEY });

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
    bus.register({ name: 'testEvent', handlerBindingKey: HANDLER_KEY });

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
    bus.register({ name: 'testEvent', handlerBindingKey: HANDLER_KEY });

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
    bus.register({ name: 'testEvent', handlerBindingKey: firstKey });
    bus.register({ name: 'testEvent', handlerBindingKey: secondKey });

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
    bus.register({ name: 'testEvent', handlerBindingKey: HANDLER_KEY });

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
    bus.register({ name: 'testEvent', handlerBindingKey: HANDLER_KEY });

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
