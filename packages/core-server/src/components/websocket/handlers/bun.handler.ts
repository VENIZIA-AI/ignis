import type { TBunServerInstance } from '@/base/applications';
import { UuidHelper } from '@venizia/ignis-helpers/core';
import type { OpenAPIHono } from '@hono/zod-openapi';

export function createBunFetchHandler(opts: {
  wsPath: string;
  honoServer: OpenAPIHono;
}): (req: Request, server: TBunServerInstance) => Promise<Response | undefined> {
  const { wsPath, honoServer } = opts;

  return async (req: Request, server: TBunServerInstance): Promise<Response | undefined> => {
    const url = new URL(req.url);
    const isWebSocketUpgrade =
      url.pathname === wsPath && req.headers.get('upgrade')?.toLowerCase() === 'websocket';

    if (!isWebSocketUpgrade) {
      return honoServer.fetch(req, server);
    }

    // Accept connection — authentication happens post-connect via 'authenticate' event
    const isUpgraded = server.upgrade(req, {
      data: {
        clientId: UuidHelper.getInstance().v4(),
      },
    });

    if (!isUpgraded) {
      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    return undefined;
  };
}
