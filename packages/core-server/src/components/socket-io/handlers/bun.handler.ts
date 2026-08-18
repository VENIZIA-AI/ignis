import type { OpenAPIHono } from '@hono/zod-openapi';
import type { TBunServerInstance } from '@/base/applications';
import type { ServerOptions } from 'socket.io';

export async function createBunEngine(opts: {
  serverOptions: Partial<ServerOptions>;
}): Promise<{ engine: any; engineHandler: any }> {
  const { serverOptions } = opts;
  const { Server: BunEngine } = await import('@socket.io/bun-engine');

  // Extract cors fields explicitly to bridge socket.io/bun-engine type differences
  const corsConfig = typeof serverOptions.cors === 'object' ? serverOptions.cors : undefined;
  const engine = new BunEngine({
    path: serverOptions.path ?? '/socket.io/',
    ...(corsConfig && {
      cors: {
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

export function createBunFetchHandler(opts: {
  engine: any;
  enginePath: string;
  honoServer: OpenAPIHono;
}): (req: Request, server: TBunServerInstance) => Response | Promise<Response> {
  const { engine, enginePath, honoServer } = opts;

  return (req: Request, server: TBunServerInstance): Response | Promise<Response> => {
    const url = new URL(req.url);

    if (!url.pathname.startsWith(enginePath)) {
      return honoServer.fetch(req, server);
    }

    return engine.handleRequest(req, server) ?? new Response(null, { status: 404 });
  };
}
