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
import { SocketIOBindingKeys } from '@venizia/ignis/socket-io';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { SocketIOConstants, SocketIOServerHelper } from '@venizia/ignis-helpers/socket-io';

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

/** Every authenticated client auto-joins `SocketIOConstants.ROOM_DEFAULT` - this pushes into it. */
@controller({ path: '/chat' })
export class ChatController extends BaseRestController {
  private _socketIO: SocketIOServerHelper | null = null;

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: ChatController.name, path: '/chat' });
    this.definitions = RouteConfigs;
  }

  // SOCKET_IO_INSTANCE is bound only after the server starts - resolve it lazily, never in the
  // constructor.
  private get socketIO(): SocketIOServerHelper {
    this._socketIO ??=
      this.application.get<SocketIOServerHelper>({
        key: SocketIOBindingKeys.SOCKET_IO_INSTANCE,
        isOptional: true,
      }) ?? null;

    if (!this._socketIO) {
      throw getError({ message: '[ChatController] SocketIO is not ready yet' });
    }

    return this._socketIO;
  }

  override binding(): void {
    this.bindRoute({ configs: RouteConfigs.SEND }).to({
      handler: (context: TRouteContext) => {
        const { message } = context.req.valid<TMessageRequest>('json');

        // `send()` always goes through the Redis emitter, so this reaches the room even when the
        // client is connected to a different server instance.
        this.socketIO.send({
          destination: SocketIOConstants.ROOM_DEFAULT,
          payload: { topic: 'chat:message', data: { message, time: new Date().toISOString() } },
        });

        return context.json(
          { sent: true, room: SocketIOConstants.ROOM_DEFAULT },
          HTTP.ResultCodes.RS_2.Ok,
        );
      },
    });
  }
}
