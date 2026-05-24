/** Kafka Consumer lifecycle & reconnect regression tests (no broker required) */

import { sleep } from '@/utilities/date.utility';
import { KafkaConsumerHelper } from '@/modules/queue/kafka';
import { KafkaClientEvents, KafkaHealthStatuses } from '@/modules/queue/kafka/common/constants';
import type { MessagesStream } from '@platformatic/kafka';
import { describe, expect, test } from 'bun:test';
import { Readable } from 'node:stream';

const newConsumer = () =>
  KafkaConsumerHelper.newInstance({
    clientId: 'ignis-test-lifecycle',
    bootstrapBrokers: ['127.0.0.1:9092'],
    groupId: 'ignis-test-lifecycle-group',
  });

const asStream = (readable: Readable) =>
  readable as unknown as MessagesStream<string, string, string, string>;

const guard = (signal: Promise<void>, ms: number, label: string) =>
  Promise.race([
    signal,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), ms);
    }),
  ]);

// -------------------------------------------------------------------------
// Dead-stream reconnect: the consume loop must never hang
// -------------------------------------------------------------------------

describe('KafkaConsumerHelper - dead stream reconnect', () => {
  test('TC-100: destroyDeadStream() unblocks consume loop and reaches attemptReconnect', async () => {
    const helper = newConsumer();

    // A real Node Readable that never pushes — faithfully reproduces an idle
    // consumer parked at `yield* this.stream` via the native async iterator.
    const fakeStream = new Readable({ objectMode: true, read() {} });

    let didAdvance = false;
    let markAdvanced!: () => void;
    const advancedPromise = new Promise<void>(resolve => {
      markAdvanced = resolve;
    });
    helper['attemptReconnect'] = async () => {
      didAdvance = true;
      helper['consumeStartOptions'] = null; // break the loop cleanly
      markAdvanced();
    };

    helper['consumeStartOptions'] = { topics: ['t'] };
    helper['stream'] = asStream(fakeStream);

    const loop = helper['startConsumeLoop']({
      messageHandler: async () => {},
      reconnectDelayMs: 1,
      maxReconnectAttempts: 5,
    });

    await sleep(50);
    helper['destroyDeadStream']();

    await guard(advancedPromise, 2_000, 'consume loop never reached attemptReconnect');
    expect(didAdvance).toBe(true);
    await loop;
  });

  test('TC-101: exhausting maxReconnectAttempts exits the loop (no infinite hang)', async () => {
    const helper = newConsumer();

    let reconnectCalls = 0;
    // Reconnect always "fails" (never sets this.stream), so consecutiveErrors keeps climbing.
    helper['attemptReconnect'] = async () => {
      reconnectCalls += 1;
    };

    helper['consumeStartOptions'] = { topics: ['t'] };
    helper['stream'] = null;

    const loop = helper['startConsumeLoop']({
      messageHandler: async () => {},
      reconnectDelayMs: 1,
      maxReconnectAttempts: 3,
    });

    // Loop must terminate on its own once retries are exhausted.
    await guard(loop, 2_000, 'loop did not exit after exhausting reconnect attempts');
    expect(reconnectCalls).toBe(3);
  });

  test('TC-102: shutdown during reconnect exits the loop', async () => {
    const helper = newConsumer();

    let reconnectCalls = 0;
    helper['attemptReconnect'] = async () => {
      reconnectCalls += 1;
      helper['consumeStartOptions'] = null; // simulate close() during reconnect
    };

    helper['consumeStartOptions'] = { topics: ['t'] };
    helper['stream'] = null;

    const loop = helper['startConsumeLoop']({
      messageHandler: async () => {},
      reconnectDelayMs: 1,
      maxReconnectAttempts: 5,
    });

    await guard(loop, 2_000, 'loop did not exit on shutdown during reconnect');
    expect(reconnectCalls).toBe(1);
  });

  test('TC-103: a stream that ends normally advances the loop to reconnect', async () => {
    const helper = newConsumer();

    // Readable that immediately ends (pushes EOF) — drainStream yield* completes normally.
    const endingStream = new Readable({ objectMode: true, read() {} });

    let didAdvance = false;
    let markAdvanced!: () => void;
    const advancedPromise = new Promise<void>(resolve => {
      markAdvanced = resolve;
    });
    helper['attemptReconnect'] = async () => {
      didAdvance = true;
      helper['consumeStartOptions'] = null;
      markAdvanced();
    };

    helper['consumeStartOptions'] = { topics: ['t'] };
    helper['stream'] = asStream(endingStream);

    const loop = helper['startConsumeLoop']({
      messageHandler: async () => {},
      reconnectDelayMs: 1,
      maxReconnectAttempts: 5,
    });

    endingStream.push(null); // signal end-of-stream

    await guard(advancedPromise, 2_000, 'normal stream end did not advance to reconnect');
    expect(didAdvance).toBe(true);
    await loop;
  });

  test('TC-104: destroyDeadStream() is idempotent and safe when already null', () => {
    const helper = newConsumer();
    expect(() => helper['destroyDeadStream']()).not.toThrow();
    const fakeStream = new Readable({ objectMode: true, read() {} });
    fakeStream.on('error', () => {});
    helper['stream'] = asStream(fakeStream);
    expect(() => helper['destroyDeadStream']()).not.toThrow();
    expect(helper.getStream()).toBeNull();
    expect(() => helper['destroyDeadStream']()).not.toThrow(); // second call, already null
  });
});

// -------------------------------------------------------------------------
// Base health tracking driven by broker events (no broker required)
// -------------------------------------------------------------------------

describe('KafkaConsumerHelper - broker health tracking', () => {
  const emit = (helper: KafkaConsumerHelper, event: string, host: string, port: number) => {
    helper.getConsumer().emit(event, { broker: { host, port } });
  };

  test('TC-110: tracks connect/disconnect/failed broker events', () => {
    const helper = newConsumer();
    expect(helper.getConnectedBrokerCount()).toBe(0);
    expect(helper.isHealthy()).toBe(false);
    expect(helper.getHealthStatus()).toBe(KafkaHealthStatuses.UNKNOWN);

    emit(helper, KafkaClientEvents.BROKER_CONNECT, 'h1', 9092);
    emit(helper, KafkaClientEvents.BROKER_CONNECT, 'h2', 9092);
    expect(helper.getConnectedBrokerCount()).toBe(2);
    expect(helper.isHealthy()).toBe(true);
    expect(helper.getHealthStatus()).toBe(KafkaHealthStatuses.CONNECTED);

    // Duplicate connect for an already-known broker must not double-count.
    emit(helper, KafkaClientEvents.BROKER_CONNECT, 'h1', 9092);
    expect(helper.getConnectedBrokerCount()).toBe(2);

    emit(helper, KafkaClientEvents.BROKER_DISCONNECT, 'h1', 9092);
    expect(helper.getConnectedBrokerCount()).toBe(1);
    expect(helper.isHealthy()).toBe(true); // still one broker

    emit(helper, KafkaClientEvents.BROKER_DISCONNECT, 'h2', 9092);
    expect(helper.getConnectedBrokerCount()).toBe(0);
    expect(helper.isHealthy()).toBe(false);
    expect(helper.getHealthStatus()).toBe(KafkaHealthStatuses.DISCONNECTED);

    // A failed event on an already-empty pool stays at 0 (no negative count).
    emit(helper, KafkaClientEvents.BROKER_FAILED, 'h3', 9092);
    expect(helper.getConnectedBrokerCount()).toBe(0);
  });
});
