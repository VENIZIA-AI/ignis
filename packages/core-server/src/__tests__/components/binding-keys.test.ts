/**
 * Every component key of core-server keeps its string and is typed. The strings are what an application binds and
 * injects, so a changed one is a break; the `@ts-expect-error` lines pin the value types.
 */

import { describe, expect, test } from 'bun:test';
import { ApiReferenceBindingKeys } from '@/components/api-reference/common/keys';
import { GrpcBindingKeys } from '@/components/controller/grpc/common/types';
import { HealthCheckBindingKeys } from '@/components/health-check/common/keys';
import { ServerInfoBindingKeys } from '@/components/server-info/common/keys';
import { SocketIOBindingKeys } from '@/components/socket-io/common/keys';
import { StaticAssetBindingKeys } from '@/components/static-asset/common/keys';
import { WebSocketBindingKeys } from '@/components/websocket/common/keys';
import { Container } from '@venizia/ignis-kernel';

describe('the component binding keys keep their strings', () => {
  test.each([
    [ApiReferenceBindingKeys.API_REFERENCE_OPTIONS, '@app/api-reference/options'],
    [GrpcBindingKeys.GRPC_COMPONENT_OPTIONS, '@app/grpc/options'],
    [HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS, '@app/health-check/options'],
    [HealthCheckBindingKeys.APPLICATION_INFO, '@app/health-check/application-info'],
    [ServerInfoBindingKeys.SERVER_INFO_OPTIONS, '@app/server-info/options'],
    [StaticAssetBindingKeys.STATIC_ASSET_OPTIONS, '@app/static-asset/options'],
    [
      StaticAssetBindingKeys.policyService({ name: 'avatars' }),
      '@app/static-asset/policy-service/avatars',
    ],
    [
      StaticAssetBindingKeys.commitService({ name: 'avatars' }),
      '@app/static-asset/commit-service/avatars',
    ],
    [SocketIOBindingKeys.SOCKET_IO_INSTANCE, '@app/socket-io/instance'],
    [SocketIOBindingKeys.SERVER_OPTIONS, '@app/socket-io/server-options'],
    [SocketIOBindingKeys.REDIS_CONNECTION, '@app/socket-io/redis-connection'],
    [SocketIOBindingKeys.AUTHENTICATE_HANDLER, '@app/socket-io/authenticate-handler'],
    [SocketIOBindingKeys.VALIDATE_ROOM_HANDLER, '@app/socket-io/validate-room-handler'],
    [SocketIOBindingKeys.CLIENT_CONNECTED_HANDLER, '@app/socket-io/client-connected-handler'],
    [WebSocketBindingKeys.WEBSOCKET_INSTANCE, '@app/websocket/instance'],
    [WebSocketBindingKeys.SERVER_OPTIONS, '@app/websocket/server-options'],
    [WebSocketBindingKeys.REDIS_CONNECTION, '@app/websocket/redis-connection'],
    [WebSocketBindingKeys.AUTHENTICATE_HANDLER, '@app/websocket/authenticate-handler'],
    [WebSocketBindingKeys.VALIDATE_ROOM_HANDLER, '@app/websocket/validate-room-handler'],
    [WebSocketBindingKeys.CLIENT_CONNECTED_HANDLER, '@app/websocket/client-connected-handler'],
    [
      WebSocketBindingKeys.CLIENT_DISCONNECTED_HANDLER,
      '@app/websocket/client-disconnected-handler',
    ],
    [WebSocketBindingKeys.MESSAGE_HANDLER, '@app/websocket/message-handler'],
    [WebSocketBindingKeys.OUTBOUND_TRANSFORMER, '@app/websocket/outbound-transformer'],
    [WebSocketBindingKeys.HANDSHAKE_HANDLER, '@app/websocket/handshake-handler'],
  ])('%s', (key, expected) => {
    expect(key).toBe(expected);
  });
});

describe('a component key reads its value type', () => {
  test('options keys take their options type, and a wrong value is a type error', () => {
    const container = new Container();

    container.bind({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS }).toValue({});
    // @ts-expect-error a string is not the health check options
    new Container().bind({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS }).toValue('x');

    const options = container.get({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS });
    const typed: object = options;

    expect(typed).toEqual({});
  });

  test('a handler key is nullable: the component binds null until an application binds a function', () => {
    const container = new Container();

    container.bind({ key: WebSocketBindingKeys.MESSAGE_HANDLER }).toValue(null);
    container.bind({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(null);

    const handler = container.get({ key: WebSocketBindingKeys.MESSAGE_HANDLER });
    const none: null | ((...args: never[]) => unknown) = handler;

    expect(none).toBeNull();
  });

  test('the per-entry static asset keys carry their service types', () => {
    const container = new Container();
    const policyKey = StaticAssetBindingKeys.policyService({ name: 'a' });

    // @ts-expect-error a string is not a policy service
    container.bind({ key: policyKey }).toValue('x');

    expect(policyKey).toBe('@app/static-asset/policy-service/a');
  });
});
