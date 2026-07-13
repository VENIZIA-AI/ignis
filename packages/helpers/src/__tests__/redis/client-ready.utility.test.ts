import { AnyType } from '@/common';
import { ensureRedisClientsConnecting, TRedisClient, waitForRedisReady } from '@/modules/redis';
import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';

class FakeRedisClient extends EventEmitter {
  status = 'wait';
  connectCallCount = 0;

  connect(): Promise<void> {
    this.connectCallCount++;
    return Promise.resolve();
  }
}

const asRedisClient = (client: FakeRedisClient): TRedisClient => {
  return client as AnyType;
};

describe('waitForRedisReady', () => {
  test('rejects instead of hanging when the client never reaches ready', async () => {
    const client = new FakeRedisClient();

    let caught: unknown;
    try {
      await waitForRedisReady({ client: asRedisClient(client), timeoutMs: 50 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('did not become ready within 50ms');
  });

  test('resolves as soon as the client emits ready', async () => {
    const client = new FakeRedisClient();

    const execution = waitForRedisReady({ client: asRedisClient(client), timeoutMs: 1_000 });
    client.status = 'ready';
    client.emit('ready');

    await execution;
  });
});

describe('ensureRedisClientsConnecting', () => {
  test('connects only the clients parked in wait', () => {
    const waiting = new FakeRedisClient();
    const connected = new FakeRedisClient();
    connected.status = 'ready';

    ensureRedisClientsConnecting({
      clients: [asRedisClient(waiting), asRedisClient(connected)],
      scope: 'configure',
    });

    expect(waiting.connectCallCount).toBe(1);
    expect(connected.connectCallCount).toBe(0);
  });
});
