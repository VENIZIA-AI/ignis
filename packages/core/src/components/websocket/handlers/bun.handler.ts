import type { OpenAPIHono } from '@hono/zod-openapi';
import type { TBunServerInstance } from '@/base/applications';

export function createBunFetchHandler(opts: {
  wsPath: string;
  honoServer: OpenAPIHono;
}): (req: Request, server: TBunServerInstance) => Promise<Response | undefined> {
  const { wsPath, honoServer } = opts;

  return async (req: Request, server: TBunServerInstance): Promise<Response | undefined> => {
    const url = new URL(req.url);
    const isWebSocketUpgrade =
      url.pathname === wsPath && req.headers.get('upgrade')?.toLowerCase() === 'websocket';

    // Not a WebSocket request — delegate to Hono
    if (!isWebSocketUpgrade) {
      return honoServer.fetch(req, server);
    }

    // Accept connection — authentication happens post-connect via 'authenticate' event
    const isUpgraded = server.upgrade(req, {
      data: {
        clientId: crypto.randomUUID(),
      },
    });

    if (!isUpgraded) {
      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    return undefined as unknown as Response;
  };
}
