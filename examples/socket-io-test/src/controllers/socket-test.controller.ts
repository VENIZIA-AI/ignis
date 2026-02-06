import {
  BaseController,
  BindingKeys,
  BindingNamespaces,
  controller,
  inject,
  jsonResponse,
  TRouteContext,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers';
import { SocketEventService } from '../services';

// Response schemas
const SocketInfoSchema = z.object({
  status: z.string(),
  connectedClients: z.number(),
  clientIds: z.array(z.string()),
});

const ClientsListSchema = z.object({
  count: z.number(),
  clients: z.array(z.string()),
});

const SuccessMessageSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const ClientRoomsSchema = z.object({
  success: z.boolean(),
  rooms: z.array(z.string()).optional(),
  message: z.string().optional(),
});

const HealthCheckSchema = z.object({
  healthy: z.boolean(),
  timestamp: z.string(),
});

// Route configurations
const RouteConfigs = {
  INFO: {
    method: HTTP.Methods.GET,
    path: '/info',
    responses: jsonResponse({
      schema: SocketInfoSchema,
      description: 'Socket.IO server info',
    }),
  },
  CLIENTS: {
    method: HTTP.Methods.GET,
    path: '/clients',
    responses: jsonResponse({
      schema: ClientsListSchema,
      description: 'List of connected clients',
    }),
  },
  BROADCAST: {
    method: HTTP.Methods.POST,
    path: '/broadcast',
    responses: jsonResponse({
      schema: SuccessMessageSchema,
      description: 'Broadcast result',
    }),
  },
  SEND_TO_ROOM: {
    method: HTTP.Methods.POST,
    path: '/room/{roomId}/send',
    responses: jsonResponse({
      schema: SuccessMessageSchema,
      description: 'Message sent to room',
    }),
  },
  SEND_TO_CLIENT: {
    method: HTTP.Methods.POST,
    path: '/client/{clientId}/send',
    responses: jsonResponse({
      schema: SuccessMessageSchema,
      description: 'Message sent to client',
    }),
  },
  JOIN_ROOM: {
    method: HTTP.Methods.POST,
    path: '/client/{clientId}/join',
    responses: jsonResponse({
      schema: SuccessMessageSchema,
      description: 'Client joined rooms',
    }),
  },
  LEAVE_ROOM: {
    method: HTTP.Methods.POST,
    path: '/client/{clientId}/leave',
    responses: jsonResponse({
      schema: SuccessMessageSchema,
      description: 'Client left rooms',
    }),
  },
  CLIENT_ROOMS: {
    method: HTTP.Methods.GET,
    path: '/client/{clientId}/rooms',
    responses: jsonResponse({
      schema: ClientRoomsSchema,
      description: 'Client room list',
    }),
  },
  HEALTH: {
    method: HTTP.Methods.GET,
    path: '/health',
    responses: jsonResponse({
      schema: HealthCheckSchema,
      description: 'Health check',
    }),
  },
} as const;

@controller({ path: '/socket' })
export class SocketTestController extends BaseController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: SocketEventService.name,
      }),
    })
    private socketEventService: SocketEventService,
  ) {
    super({ scope: SocketTestController.name });
    this.definitions = RouteConfigs;
  }

  // --------------------------------------------------------------------------------
  binding() {
    // GET /socket/info
    this.bindRoute({ configs: RouteConfigs.INFO }).to({
      handler: (c: TRouteContext) => {
        const clients = this.socketEventService.getConnectedClients();

        return c.json(
          {
            status: 'running',
            connectedClients: clients.length,
            clientIds: clients,
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // GET /socket/clients
    this.bindRoute({ configs: RouteConfigs.CLIENTS }).to({
      handler: (c: TRouteContext) => {
        const clients = this.socketEventService.getConnectedClients();

        return c.json(
          {
            count: clients.length,
            clients,
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // POST /socket/broadcast
    this.bindRoute({ configs: RouteConfigs.BROADCAST }).to({
      handler: async (c: TRouteContext) => {
        const body = await c.req.json<{ topic: string; data: unknown }>();
        const { topic, data } = body;

        if (!topic) {
          return c.json({ error: 'Topic is required' }, HTTP.ResultCodes.RS_4.BadRequest);
        }

        this.socketEventService.broadcastMessage({ topic, data });

        return c.json(
          {
            success: true,
            message: `Broadcast sent to ${this.socketEventService.getClientCount()} clients`,
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // POST /socket/room/:roomId/send
    this.bindRoute({ configs: RouteConfigs.SEND_TO_ROOM }).to({
      handler: async (c: TRouteContext) => {
        const roomId = c.req.param('roomId');
        const body = await c.req.json<{ topic: string; data: unknown }>();
        const { topic, data } = body;

        if (!topic) {
          return c.json({ error: 'Topic is required' }, HTTP.ResultCodes.RS_4.BadRequest);
        }

        this.socketEventService.sendToRoom({ room: roomId, topic, data });

        return c.json(
          {
            success: true,
            message: `Message sent to room: ${roomId}`,
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // POST /socket/client/:clientId/send
    this.bindRoute({ configs: RouteConfigs.SEND_TO_CLIENT }).to({
      handler: async (c: TRouteContext) => {
        const clientId = c.req.param('clientId');
        const body = await c.req.json<{ topic: string; data: unknown }>();
        const { topic, data } = body;

        if (!topic) {
          return c.json({ error: 'Topic is required' }, HTTP.ResultCodes.RS_4.BadRequest);
        }

        this.socketEventService.sendToClient({ clientId, topic, data });

        return c.json(
          {
            success: true,
            message: `Message sent to client: ${clientId}`,
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });

    // POST /socket/client/:clientId/join
    this.bindRoute({ configs: RouteConfigs.JOIN_ROOM }).to({
      handler: async (c: TRouteContext) => {
        const clientId = c.req.param('clientId');
        const body = await c.req.json<{ rooms: string[] }>();
        const { rooms } = body;

        if (!rooms?.length) {
          return c.json({ error: 'Rooms array is required' }, HTTP.ResultCodes.RS_4.BadRequest);
        }

        const result = this.socketEventService.joinRoom({ clientId, rooms });

        return c.json(result, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // POST /socket/client/:clientId/leave
    this.bindRoute({ configs: RouteConfigs.LEAVE_ROOM }).to({
      handler: async (c: TRouteContext) => {
        const clientId = c.req.param('clientId');
        const body = await c.req.json<{ rooms: string[] }>();
        const { rooms } = body;

        if (!rooms?.length) {
          return c.json({ error: 'Rooms array is required' }, HTTP.ResultCodes.RS_4.BadRequest);
        }

        const result = this.socketEventService.leaveRoom({ clientId, rooms });

        return c.json(result, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // GET /socket/client/:clientId/rooms
    this.bindRoute({ configs: RouteConfigs.CLIENT_ROOMS }).to({
      handler: (c: TRouteContext) => {
        const clientId = c.req.param('clientId');
        const result = this.socketEventService.getClientRooms({ clientId });

        return c.json(result, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // GET /socket/health
    this.bindRoute({ configs: RouteConfigs.HEALTH }).to({
      handler: (c: TRouteContext) => {
        return c.json(
          {
            healthy: this.socketEventService.isReady(),
            timestamp: new Date().toISOString(),
          },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });
  }
}
