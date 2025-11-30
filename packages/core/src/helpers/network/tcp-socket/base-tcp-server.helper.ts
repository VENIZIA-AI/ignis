import { BaseHelper } from '@/base/helpers';
import { ValueOrPromise } from '@/common/types';
import { getError } from '@/helpers/error';
import { dayjs } from '@/utilities/date.utility';
import { getUID } from '@/utilities/parse.utility';
import omit from 'lodash/omit';
import {
  ListenOptions,
  ServerOpts,
  Socket as SocketClient,
  Server as SocketServer,
} from 'node:net';

export interface ITcpSocketClient<SocketClientType> {
  id: string;
  socket: SocketClientType;
  state: 'unauthorized' | 'authenticating' | 'authenticated';
  subscriptions: Set<string>;
  storage: {
    connectedAt: dayjs.Dayjs;
    authenticatedAt: dayjs.Dayjs | null;
    [additionField: symbol | string]: any;
  };
}

export interface ITcpSocketServerOptions<
  SocketServerOptions extends ServerOpts = ServerOpts,
  SocketServerType extends SocketServer = SocketServer,
  SocketClientType extends SocketClient = SocketClient,
> {
  scope?: string;
  identifier: string;

  serverOptions: Partial<SocketServerOptions>;
  listenOptions: Partial<ListenOptions>;
  authenticateOptions: { required: boolean; duration?: number };

  extraEvents?: Record<
    string,
    (opts: { id: string; socket: SocketClientType; args: any }) => ValueOrPromise<void>
  >;

  createServerFn: (
    options: Partial<SocketServerOptions>,
    connectionListener: (socket: SocketClientType) => void,
  ) => SocketServerType;

  // handlers
  onServerReady?: (opts: { server: SocketServerType }) => void;
  onClientConnected?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientData?: (opts: { id: string; socket: SocketClientType; data: Buffer | string }) => void;
  onClientClose?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientError?: (opts: { id: string; socket: SocketClientType; error: Error }) => void;
}

export class BaseNetworkTcpServer<
  SocketServerOptions extends ServerOpts = ServerOpts,
  SocketServerType extends SocketServer = SocketServer,
  SocketClientType extends SocketClient = SocketClient,
> extends BaseHelper {
  protected serverOptions: Partial<SocketServerOptions> = {};
  protected listenOptions: Partial<ListenOptions> = {};
  protected authenticateOptions: { required: boolean; duration?: number };

  protected clients: Record<string, ITcpSocketClient<SocketClientType>>;
  protected server: SocketServerType;

  protected extraEvents: Record<
    string,
    (opts: { id: string; socket: SocketClientType; args: any }) => ValueOrPromise<void>
  >;

  protected createServerFn: (
    options: Partial<SocketServerOptions>,
    connectionListener: (socket: SocketClientType) => void,
  ) => SocketServerType;

  // handlers
  protected onServerReady?: (opts: { server: SocketServerType }) => void;
  protected onClientConnected?: (opts: { id: string; socket: SocketClientType }) => void;
  protected onClientData?: (opts: {
    id: string;
    socket: SocketClientType;
    data: Buffer | string;
  }) => void;
  protected onClientClose?: (opts: { id: string; socket: SocketClientType }) => void;
  protected onClientError?: (opts: { id: string; socket: SocketClientType; error: Error }) => void;

  constructor(
    opts: ITcpSocketServerOptions<SocketServerOptions, SocketServerType, SocketClientType>,
  ) {
    super({
      scope: opts.scope ?? opts.identifier ?? BaseNetworkTcpServer.name,
      identifier: opts.identifier,
    });

    this.clients = Object.assign({});

    this.serverOptions = opts.serverOptions;
    this.listenOptions = opts.listenOptions;
    this.authenticateOptions = opts.authenticateOptions;

    if (
      this.authenticateOptions.required &&
      (!this.authenticateOptions.duration || this.authenticateOptions.duration < 0)
    ) {
      throw getError({
        message:
          'TCP Server | Invalid authenticate duration | Required duration for authenticateOptions',
      });
    }

    this.extraEvents = opts.extraEvents ?? {};

    this.createServerFn = opts.createServerFn;

    this.onServerReady = opts.onServerReady;
    this.onClientConnected = opts.onClientConnected;
    this.onClientData = opts.onClientData;
    this.onClientClose = opts.onClientClose;

    this.configure();
  }

  configure() {
    this.server = this.createServerFn(this.serverOptions, socket => {
      this.onNewConnection({ socket });
    });

    this.server.listen(this.listenOptions, () => {
      this.logger.info(
        '[configure] TCP Socket Server is now listening | Options: %j',
        this.listenOptions,
      );

      this.onServerReady?.({ server: this.server });
    });
  }

  onNewConnection(opts: { socket: SocketClientType }) {
    const { socket } = opts;

    const id = getUID();

    socket.on('data', (data: Buffer | string) => {
      this.onClientData?.({ id, socket, data });
    });

    socket.on('error', (error: Error) => {
      this.logger.error('[onClientConnect][error] ID: %s | Error: %s', id, error);

      this.onClientError?.({ id, socket, error });
      socket.end();
    });

    socket.on('close', (hasError: boolean) => {
      this.logger.info('[onClientConnect][close] ID: %s | hasError: %s', id, hasError);

      this.onClientClose?.({ id, socket });
      this.clients = omit(this.clients, [id]);
    });

    for (const extraEvent in this.extraEvents) {
      socket.on(extraEvent, args => {
        this.extraEvents[extraEvent]({ id, socket, args });
      });
    }

    this.clients[id] = {
      id,
      socket,
      state: this.authenticateOptions.required ? 'unauthorized' : 'authenticated',
      subscriptions: new Set([]),
      storage: {
        connectedAt: dayjs(),
        authenticatedAt: this.authenticateOptions.required ? null : dayjs(),
      },
    };

    this.logger.info(
      '[onClientConnect] New TCP SocketClient | Client: %s | authenticateOptions: %s %s',
      `${id} - ${socket.remoteAddress} - ${socket.remotePort} - ${socket.remoteFamily}`,
      this.authenticateOptions.required,
      this.authenticateOptions.duration,
    );

    this.onClientConnected?.({ id, socket });

    // Check client authentication
    if (
      this.authenticateOptions.required &&
      this.authenticateOptions.duration &&
      this.authenticateOptions.duration > 0
    ) {
      setTimeout(() => {
        const client = this.getClient({ id });
        if (!client) {
          return;
        }

        if (client.state === 'authenticated') {
          return;
        }

        this.emit({ clientId: id, payload: 'Unauthorized Client' });
        client.socket.end();
      }, this.authenticateOptions.duration);
    }
  }

  getClients() {
    return this.clients;
  }

  getClient(opts: { id: string }) {
    return this.clients?.[opts.id];
  }

  getServer() {
    return this.server;
  }

  doAuthenticate(opts: { id: string; state: 'unauthorized' | 'authenticating' | 'authenticated' }) {
    const { id, state } = opts;

    const client = this.getClient({ id });
    if (!client) {
      this.logger.error('[authenticateClient][%s] Client %s NOT FOUND', id);
      return;
    }

    client.state = state;

    switch (state) {
      case 'unauthorized':
      case 'authenticating': {
        client.storage.authenticatedAt = null;
        break;
      }
      case 'authenticated': {
        client.storage.authenticatedAt = dayjs();
        break;
      }
      default: {
        break;
      }
    }
  }

  emit(opts: { clientId: string; payload: Buffer | string }) {
    const { clientId, payload } = opts;
    const client = this.getClient({ id: clientId });

    if (!client) {
      this.logger.error('[emit][%s] Client %s NOT FOUND', clientId);
      return;
    }

    const { socket } = client;
    if (!socket.writable) {
      this.logger.error('[emit][%s] Client %s NOT WRITABLE', clientId);
      return;
    }

    if (!payload?.length) {
      this.logger.info(
        '[emit][%s] Client %s | Invalid payload to write to TCP Socket!',
        this.identifier,
        clientId,
      );
      return;
    }

    socket.write(payload);
  }
}
