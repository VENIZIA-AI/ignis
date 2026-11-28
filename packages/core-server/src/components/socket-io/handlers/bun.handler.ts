import type { OpenAPIHono } from '@hono/zod-openapi';
import { ExecutionFrames } from '@venizia/ignis-helpers/core';
import type { TBunServerInstance } from '@/base/applications';
import type { ServerOptions } from 'socket.io';

export class SocketIOBunHandler {
  static async createEngine(opts: { serverOptions: Partial<ServerOptions> }) {
    const { serverOptions } = opts;
    const { Server: BunEngine } = await import('@socket.io/bun-engine');

    // Extract cors fields explicitly to bridge socket.io/bun-engine type differences
    const corsConfig = typeof serverOptions.cors === 'object' ? serverOptions.cors : undefined;
    const engine = new BunEngine({
      path: serverOptions.path ?? '/socket.io/',
      ...(corsConfig && {
        cors: {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- socket.io types `origin` wider than the option of `@socket.io/bun-engine` declares
          origin: corsConfig.origin as string | RegExp | (string | RegExp)[] | undefined,
          methods: corsConfig.methods,
          credentials: corsConfig.credentials,
          allowedHeaders: corsConfig.allowedHeaders,
          exposedHeaders: corsConfig.exposedHeaders,
          maxAge: corsConfig.maxAge,
        },
      }),
    });

    const engineHandler = engine.handler();

    return { engine, engineHandler };
  }

  static createFetchHandler(opts: {
    engine: Awaited<ReturnType<typeof SocketIOBunHandler.createEngine>>['engine'];
    enginePath: string;
    honoServer: OpenAPIHono;
  }): (req: Request, server: TBunServerInstance) => Response | Promise<Response> {
    const { engine, enginePath, honoServer } = opts;

    return (req: Request, server: TBunServerInstance): Response | Promise<Response> => {
      const url = new URL(req.url);

      if (!url.pathname.startsWith(enginePath)) {
        return honoServer.fetch(req, server);
      }

      // This path does not go through the application's middlewares, so it opens its own frame: without one, a
      // request would run in whatever frame started the server.
      return ExecutionFrames.root({
        task: () => engine.handleRequest(req, server) ?? new Response(null, { status: 404 }),
      });
    };
  }

  /** The engine's socket callbacks, each in a frame of its own, and so every listener of the application behind them. */
  static createWebSocketHandler(opts: {
    engineHandler: Awaited<ReturnType<typeof SocketIOBunHandler.createEngine>>['engineHandler'];
  }) {
    const { websocket } = opts.engineHandler;

    return {
      maxPayloadLength: websocket.maxPayloadLength,
      open: ExecutionFrames.listener({
        handler: (...args: Parameters<typeof websocket.open>) => websocket.open(...args),
      }),
      message: ExecutionFrames.listener({
        handler: (...args: Parameters<typeof websocket.message>) => websocket.message(...args),
      }),
      close: ExecutionFrames.listener({
        handler: (...args: Parameters<typeof websocket.close>) => websocket.close(...args),
      }),
    };
  }
}
