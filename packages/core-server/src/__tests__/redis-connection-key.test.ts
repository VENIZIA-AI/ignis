import { describe, expect, test } from 'bun:test';
import type { RedisHelperFactory } from '@venizia/ignis-helpers';
import type { Container } from '@venizia/ignis-inversion';
import { SocketIOBindingKeys } from '@/components/socket-io/common/keys';
import { WebSocketBindingKeys } from '@/components/websocket/common/keys';

/** Never called (the helpers need ioredis, which core-server does not install): the typecheck is the test. */
const bindEveryTopology = (opts: {
  container: Container;
  single: ReturnType<typeof RedisHelperFactory.single>;
  cluster: ReturnType<typeof RedisHelperFactory.cluster>;
  sentinel: ReturnType<typeof RedisHelperFactory.sentinel>;
}) => {
  const { container, single, cluster, sentinel } = opts;

  for (const key of [WebSocketBindingKeys.REDIS_CONNECTION, SocketIOBindingKeys.REDIS_CONNECTION]) {
    container.bind({ key }).toValue(single);
    container.bind({ key }).toValue(cluster);
    container.bind({ key }).toValue(sentinel);
  }
};

describe('REDIS_CONNECTION - what the factory builds binds with no cast', () => {
  test('single, cluster and sentinel results bind to both keys (checked by the typecheck)', () => {
    expect(typeof bindEveryTopology).toBe('function');
  });
});
