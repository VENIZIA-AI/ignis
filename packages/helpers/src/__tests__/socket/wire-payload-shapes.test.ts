import { describe, expect, mock, test } from 'bun:test';
import { SocketIOServerHelper } from '@/modules/socket/socket-io/server/helper';
import { WebSocketServerHelper } from '@/modules/socket/websocket/server/helper';

describe('a room list off the wire', () => {
  for (const [name, toRoomList] of [
    ['SocketIOServerHelper', SocketIOServerHelper['toRoomList']],
    ['WebSocketServerHelper', WebSocketServerHelper['toRoomList']],
  ] as const) {
    test(`${name} keeps the strings of a rooms array only`, () => {
      expect(toRoomList({ rooms: ['a', 1, 'b'] })).toEqual(['a', 'b']);

      for (const payload of [undefined, null, 'rooms', 7, {}, { rooms: 'lobby' }, []]) {
        expect(toRoomList(payload)).toEqual([]);
      }
    });
  }
});

describe('a Redis fan-out message', () => {
  const receive = (raw: string) => {
    const error = mock(() => undefined);
    const broadcast = mock(() => undefined);
    const server = {
      serverId: 'this',
      logger: { for: () => ({ error }) },
      onRedisMessage: () => undefined,
      broadcast,
    };
    WebSocketServerHelper.prototype['onRedisMessage'].call(server as never, { channel: 'c', raw });

    return { error, broadcast };
  };

  test('one without a string serverId and event is refused', () => {
    for (const raw of [
      'null',
      '7',
      '[]',
      '{}',
      '{"serverId":1,"event":"e"}',
      '{"serverId":"s"}',
      '{"serverId":"s","event":"e","type":"nope"}',
      '{"serverId":"s","event":"e","type":"room","target":1}',
      '{"serverId":"s","event":"e","type":"broadcast","exclude":[1]}',
    ]) {
      const { error, broadcast } = receive(raw);

      expect(error).toHaveBeenCalledTimes(1);
      expect(broadcast).not.toHaveBeenCalled();
    }
  });

  test('a well-formed broadcast is delivered', () => {
    const { broadcast } = receive('{"serverId":"other","event":"e","type":"broadcast"}');

    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});
