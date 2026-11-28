import { ExecutionRunner } from '@/base/execution';
import { SocketIOBunHandler } from '@/components/socket-io/handlers';
import { Execution, ExecutionModes } from '@/helpers';
import { OpenAPIHono } from '@hono/zod-openapi';
import { describe, expect, test } from 'bun:test';
import { Server as IOServer } from 'socket.io';
import { io as connectClient } from 'socket.io-client';

ExecutionRunner.install();

describe('socket.io on Bun, the websocket handler', () => {
  test('hands on every setting of the engine, with each callback of it framed', async () => {
    const { engineHandler } = await SocketIOBunHandler.createEngine({ serverOptions: {} });
    const { websocket } = engineHandler;
    const framed = SocketIOBunHandler.createWebSocketHandler({ engineHandler });

    // A setting or a callback a later engine adds would be dropped: this fails until it is handed on.
    expect(Object.keys(framed).sort()).toEqual(Object.keys(websocket).sort());
    expect(framed.maxPayloadLength).toBe(websocket.maxPayloadLength);

    for (const key of ['open', 'message', 'close'] as const) {
      expect(framed[key]).not.toBe(websocket[key]);
    }
  });
});

describe('socket.io on Bun, the server started inside a system run', () => {
  for (const transport of ['websocket', 'polling'] as const) {
    test(`application code on the ${transport} transport reads a root frame`, async () => {
      const seen: Array<[string, unknown]> = [];

      const record = (where: string) => {
        seen.push([where, Execution.current()]);
      };

      const done = Promise.withResolvers<void>();

      const started = await Execution.run({
        mode: ExecutionModes.SYSTEM,
        reason: 'boot',
        task: async () => {
          const io = new IOServer({ path: '/socket.io/' });
          const { engine, engineHandler } = await SocketIOBunHandler.createEngine({
            serverOptions: { path: '/socket.io/' },
          });
          io.bind(engine);
          io.use((_socket, next) => {
            record('io.use');
            next();
          });
          io.on('connection', (socket) => {
            record('connection');
            socket.on('chat', () => record('socket.on'));
            socket.on('disconnect', () => {
              record('disconnect');
              done.resolve();
            });
          });
          const server = Bun.serve({
            port: 0,
            fetch: SocketIOBunHandler.createFetchHandler({
              engine,
              enginePath: '/socket.io/',
              honoServer: new OpenAPIHono(),
            }),
            websocket: SocketIOBunHandler.createWebSocketHandler({ engineHandler }),
          });

          return { io, server };
        },
      });
      const client = connectClient(`http://127.0.0.1:${started.server.port}`, {
        transports: [transport],
      });
      client.on('connect', () => {
        client.emit('chat', 'hello');
        setTimeout(() => client.disconnect(), 100);
      });
      await done.promise;
      await started.server.stop(true);

      const root = { mode: ExecutionModes.SCOPED, values: {} };
      expect(seen).toEqual([
        ['io.use', root],
        ['connection', root],
        ['socket.on', root],
        ['disconnect', root],
      ]);
    });
  }
});
