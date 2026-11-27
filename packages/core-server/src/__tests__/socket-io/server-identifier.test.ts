// `identifier` may be bound as `undefined`, which the options type allows: the helper still gets the default name.
import { describe, expect, spyOn, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { BindingKeys } from '@venizia/ignis-inversion';
import { REDIS_HELPER_BRAND } from '@venizia/ignis-helpers';
import { SocketIOServerHelper } from '@venizia/ignis-helpers/socket-io';
import { BaseApplication } from '../../base/applications';
import { SocketIOBindingKeys, SocketIOComponent } from '../../components/socket-io';

class Application extends BaseApplication {
  getAppInfo() {
    return { name: 'socket-identifier', version: '1.0.0', description: 'test' };
  }

  staticConfigure() {}

  preConfigure() {}

  postConfigure() {}

  setupMiddlewares() {}
}

describe('SocketIOComponent, the server helper identifier', () => {
  test.each([
    ['bound as undefined', undefined, 'SOCKET_IO_SERVER'],
    ['bound', 'chat-socket-server', 'chat-socket-server'],
  ])('is right when identifier is %s', async (_, identifier, expected) => {
    const application = new Application({
      scope: 'Application',
      config: { host: '127.0.0.1', port: 0, path: { base: '/api', isStrict: false } },
    });
    const server = Bun.serve({ port: 0, fetch: () => new Response() });
    const configure = spyOn(SocketIOServerHelper.prototype, 'configure').mockResolvedValue();
    const instance = spyOn(application, 'getServerInstance').mockReturnValue(server);
    const hooks = spyOn(application, 'registerPostStartHook');

    application.bind({ key: SocketIOBindingKeys.SERVER_OPTIONS }).toValue({ identifier });
    // The component only asks for the brand, and `configure` is stubbed: no Redis is needed.
    application
      .bind({ key: BindingKeys.build<object>({ key: '@app/socket-io/redis-connection' }) })
      .toValue({ [REDIS_HELPER_BRAND]: true, duplicateClient: () => new EventEmitter() });
    application.bind({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(() => true);

    try {
      const component = new SocketIOComponent(application);

      await component.configure();
      await hooks.mock.calls[0]?.[0].hook();

      const helper = application.get({ key: SocketIOBindingKeys.SOCKET_IO_INSTANCE });

      expect(Reflect.get(helper, 'identifier')).toBe(expected);
    } finally {
      configure.mockRestore();
      instance.mockRestore();
      await server.stop(true);
    }
  });
});
