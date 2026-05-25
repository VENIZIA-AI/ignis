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

describe('KafkaConsumerHelper - client rebuild on attemptReconnect', () => {
  test('TC-105: rebuildClient() swaps to a fresh @platformatic/kafka Consumer instance', async () => {
    const helper = newConsumer();
    const before = helper.getConsumer();

    // close() on a never-connected client may hang because the platformatic
    // client tries to flush in-flight requests. Race against a tight timeout
    // here — the production codepath uses shutdownTimeout for the same reason.
    helper['closeOldClient'] = async () => {
      /* no-op — old client is unreachable, don't actually close it */
    };

    await helper['rebuildClient']();

    const after = helper.getConsumer();
    expect(after).not.toBe(before);
    // Health is reset on swap; the new client hasn't seen any BROKER_CONNECT yet.
    expect(helper.getConnectedBrokerCount()).toBe(0);
    expect(helper.isHealthy()).toBe(false);
  });

  test('TC-106: swapClient() detaches listeners from the old client (events on old client are ignored)', () => {
    const helper = newConsumer();
    const oldClient = helper.getConsumer();

    // Simulate state on the OLD client.
    oldClient.emit(KafkaClientEvents.BROKER_CONNECT, { broker: { host: 'h1', port: 9092 } });
    expect(helper.getConnectedBrokerCount()).toBe(1);

    // Build a synthetic new client by reusing the same options.
    const newClient = (
      KafkaConsumerHelper as unknown as {
        buildConsumerClient: (opts: unknown) => typeof oldClient;
      }
    ).buildConsumerClient(helper['initialOptions']);
    helper['swapClient'](newClient);

    // After swap: connectedBrokers reset, and stray events on the OLD client
    // must not propagate into the helper's state.
    expect(helper.getConnectedBrokerCount()).toBe(0);
    oldClient.emit(KafkaClientEvents.BROKER_CONNECT, { broker: { host: 'h99', port: 9092 } });
    expect(helper.getConnectedBrokerCount()).toBe(0);

    // Events on the NEW client are tracked normally.
    helper.getConsumer().emit(KafkaClientEvents.BROKER_CONNECT, {
      broker: { host: 'h2', port: 9092 },
    });
    expect(helper.getConnectedBrokerCount()).toBe(1);
  });

  test('TC-107: attemptReconnect skips rebuild when at least one broker is connected', async () => {
    const helper = newConsumer();

    // Simulate a healthy connection state.
    helper.getConsumer().emit(KafkaClientEvents.BROKER_CONNECT, {
      broker: { host: 'h1', port: 9092 },
    });
    expect(helper.getConnectedBrokerCount()).toBe(1);

    const beforeClient = helper.getConsumer();
    let rebuildCalled = false;
    helper['rebuildClient'] = async () => {
      rebuildCalled = true;
    };

    helper['consumeStartOptions'] = { topics: ['t'] };

    // Stub the consume() call to avoid touching the network.
    (
      helper.getConsumer() as unknown as {
        consume: (opts: unknown) => Promise<unknown>;
      }
    ).consume = async () => null;

    await helper['attemptReconnect']({
      attempt: 1,
      maxAttempts: 5,
      delayMs: 1,
    });

    expect(rebuildCalled).toBe(false);
    expect(helper.getConsumer()).toBe(beforeClient);
  });

  test('TC-108: sticky sessionLikelyStale flag triggers rebuild even after brokers reconnect before attemptReconnect runs', async () => {
    const helper = newConsumer();

    // Healthy initial state.
    helper.getConsumer().emit(KafkaClientEvents.BROKER_CONNECT, {
      broker: { host: 'h1', port: 9092 },
    });
    expect(helper.getConnectedBrokerCount()).toBe(1);

    // All brokers drop — this is the moment the sticky flag must be set,
    // regardless of what happens next.
    helper.getConsumer().emit(KafkaClientEvents.BROKER_DISCONNECT, {
      broker: { host: 'h1', port: 9092 },
    });
    expect(helper.getConnectedBrokerCount()).toBe(0);

    // Simulate the platformatic client transparently reconnecting TCP before
    // our attemptReconnect runs. A snapshot-style check would now see "1
    // broker connected" and skip the rebuild — the bug we're guarding against.
    helper.getConsumer().emit(KafkaClientEvents.BROKER_CONNECT, {
      broker: { host: 'h1', port: 9092 },
    });
    expect(helper.getConnectedBrokerCount()).toBe(1);

    let rebuildCalled = false;
    helper['rebuildClient'] = async () => {
      rebuildCalled = true;
    };

    helper['consumeStartOptions'] = { topics: ['t'] };
    (
      helper.getConsumer() as unknown as {
        consume: (opts: unknown) => Promise<unknown>;
      }
    ).consume = async () => null;

    await helper['attemptReconnect']({
      attempt: 1,
      maxAttempts: 5,
      delayMs: 1,
    });

    // Despite brokers being back, the sticky flag remembers we lost them all
    // at some point — rebuild fires.
    expect(rebuildCalled).toBe(true);
  });

  test('TC-109: sessionLikelyStale is cleared after a successful consume()', async () => {
    const helper = newConsumer();

    // Trip the flag via BROKER_DISCONNECT-to-0.
    helper.getConsumer().emit(KafkaClientEvents.BROKER_CONNECT, {
      broker: { host: 'h1', port: 9092 },
    });
    helper.getConsumer().emit(KafkaClientEvents.BROKER_DISCONNECT, {
      broker: { host: 'h1', port: 9092 },
    });

    helper['consumeStartOptions'] = { topics: ['t'] };
    helper['rebuildClient'] = async () => {
      /* stub: don't touch the client for this test */
    };
    (
      helper.getConsumer() as unknown as {
        consume: (opts: unknown) => Promise<unknown>;
      }
    ).consume = async () => null;

    expect(helper['sessionLikelyStale']).toBe(true);

    await helper['attemptReconnect']({
      attempt: 1,
      maxAttempts: 5,
      delayMs: 1,
    });

    // Flag must be cleared on successful consume so a later transient stream
    // error doesn't trigger an unnecessary rebuild.
    expect(helper['sessionLikelyStale']).toBe(false);
  });

  test('TC-150: rebuild triggers when sessionLikelyStale flips to true DURING the retry sleep', async () => {
    // Regression for the Copilot review: prior to the fix, attemptReconnect
    // snapshotted sessionLikelyStale BEFORE the sleep, so an all-brokers-down
    // event that arrived during the backoff window was missed — the snapshot
    // stayed `false` and consume() was called on a now-stale client.
    //
    // After the fix, the flag is read AFTER the sleep and this test exercises
    // exactly that scenario: enter attemptReconnect with the flag false, set
    // it via a BROKER_DISCONNECT-to-0 event during the sleep, and assert that
    // rebuild fires when the retry wakes up.
    const helper = newConsumer();

    // Bring at least one broker online so the disconnect-to-0 event makes sense.
    helper.getConsumer().emit(KafkaClientEvents.BROKER_CONNECT, {
      broker: { host: 'h1', port: 9092 },
    });
    expect(helper['sessionLikelyStale']).toBe(false);

    let rebuildCalled = false;
    helper['rebuildClient'] = async () => {
      rebuildCalled = true;
    };
    helper['consumeStartOptions'] = { topics: ['t'] };
    (
      helper.getConsumer() as unknown as {
        consume: (opts: unknown) => Promise<unknown>;
      }
    ).consume = async () => null;

    // Fire the BROKER_DISCONNECT event mid-sleep (just before the 100ms retry
    // delay elapses). This sets sessionLikelyStale to true while
    // attemptReconnect is suspended on `await sleep(delayMs)`.
    setTimeout(() => {
      helper.getConsumer().emit(KafkaClientEvents.BROKER_DISCONNECT, {
        broker: { host: 'h1', port: 9092 },
      });
    }, 25);

    await helper['attemptReconnect']({
      attempt: 1,
      maxAttempts: 5,
      delayMs: 100,
    });

    // The post-sleep read of the flag must see the mid-sleep transition.
    expect(rebuildCalled).toBe(true);
  });
});

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
