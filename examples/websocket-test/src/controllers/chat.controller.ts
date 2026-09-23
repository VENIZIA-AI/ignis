import { z } from '@hono/zod-openapi';
import {
  BaseApplication,
  BaseRestController,
  controller,
  CoreBindings,
  inject,
  jsonContent,
  jsonResponse,
  TRouteContext,
} from '@venizia/ignis';
import { WebSocketBindingKeys } from '@venizia/ignis/websocket';
import { getError, HTTP, WebSocketDefaults, WebSocketServerHelper } from '@venizia/ignis-helpers';

const MessageRequestSchema = z.object({ message: z.string().min(1) });
const MessageResponseSchema = z.object({ sent: z.boolean(), room: z.string() });
type TMessageRequest = z.infer<typeof MessageRequestSchema>;

const RouteConfigs = {
  SEND: {
    method: HTTP.Methods.POST,
    path: '/messages',
    request: {
      body: jsonContent({ schema: MessageRequestSchema, description: 'A chat message' }),
    },
    responses: jsonResponse({
      schema: MessageResponseSchema,
      description: 'The message was pushed to the room every authenticated client joins',
    }),
  },
} as const;

/** Every authenticated client auto-joins `WebSocketDefaults.ROOM` - this pushes into it. */
@controller({ path: '/chat' })
export class ChatController extends BaseRestController {
  private _webSocket: WebSocketServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: ChatController.name, path: '/chat' });
    this.definitions = RouteConfigs;
  }

  // WEBSOCKET_INSTANCE is bound only after the server starts - resolve it lazily, never in the
  // constructor.
  private get webSocket(): WebSocketServerHelper {
    this._webSocket ??=
      this.application.get<WebSocketServerHelper>({
        key: WebSocketBindingKeys.WEBSOCKET_INSTANCE,
        isOptional: true,
      }) ?? null;

    if (!this._webSocket) {
      throw getError({ message: '[ChatController] WebSocket is not ready yet' });
    }

    return this._webSocket;
  }

  override binding(): void {
    this.bindRoute({ configs: RouteConfigs.SEND }).to({
      handler: (context: TRouteContext) => {
        const { message } = context.req.valid<TMessageRequest>('json');

        // `send()` finds the room locally in this single-process example and also publishes to
        // Redis, so the call is the one a multi-instance deployment would make too.
        this.webSocket.send({
          destination: WebSocketDefaults.ROOM,
          payload: { topic: 'chat:message', data: { message, time: new Date().toISOString() } },
        });

        return context.json({ sent: true, room: WebSocketDefaults.ROOM }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
