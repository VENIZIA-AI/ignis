// The component's own option sits next to Socket.IO's: the key's type must take it. `bun check` is what fails here.
import { describe, expect, test } from 'bun:test';
import { Container } from '@venizia/ignis-inversion';
import type { IServerOptions } from '../../components/socket-io';
import { SocketIOBindingKeys } from '../../components/socket-io';

describe('SocketIOBindingKeys.SERVER_OPTIONS', () => {
  test('takes an object literal with identifier', () => {
    const container = new Container();

    container
      .bind({ key: SocketIOBindingKeys.SERVER_OPTIONS })
      .toValue({ identifier: 'chat-socket-server', path: '/io' });

    const options: Partial<IServerOptions> | undefined = container.get({
      key: SocketIOBindingKeys.SERVER_OPTIONS,
    });

    expect(options?.identifier).toBe('chat-socket-server');
  });
});
