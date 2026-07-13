import { ValueOrPromise } from '@/common/types';
import { BaseHelper } from '@/modules/base';
import { getError } from '@/modules/error';
import { dayjs } from '@/utilities/date.utility';
import { getUID } from '@/utilities/parse.utility';
import { voidExecution } from '@/utilities/promise.utility';
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
    authenticateTimeout?: ReturnType<typeof setTimeout> | null;
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

  onServerReady?: (opts: { server: SocketServerType }) => void;
  onClientConnected?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientData?: (opts: { id: string; socket: SocketClientType; data: Buffer | string }) => void;
  onClientClose?: (opts: { id: string; socket: SocketClientType }) => void;
  onClientError?: (opts: { id: string; socket: SocketClientType; error: Error }) => void;
  onServerError?: (opts: { server: SocketServerType; error: Error }) => void;
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

  protected onServerReady?: (opts: { server: SocketServerType }) => void;
  protected onClientConnected?: (opts: { id: string; socket: SocketClientType }) => void;
  protected onClientData?: (opts: {
    id: string;
    socket: SocketClientType;
    data: Buffer | string;
  }) => void;
  protected onClientClose?: (opts: { id: string; socket: SocketClientType }) => void;
  protected onClientError?: (opts: { id: string; socket: SocketClientType; error: Error }) => void;
  protected onServerError?: (opts: { server: SocketServerType; error: Error }) => void;

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
    this.onClientError = opts.onClientError;
    this.onServerError = opts.onServerError;

    this.configure();
  }

  // Hooks run inside socket event listeners: a synchronous throw there is an uncaught exception
  // that kills the process and skips the client-registry cleanup that follows it.
  protected invokeHook(opts: { scope: string; execution: () => void }) {
    const { scope, execution } = opts;

    try {
      execution();
    } catch (error) {
      this.logger.for(scope).error('Hook execution FAILED | Error: %s', error);
    }
  }

  configure() {
    this.server = this.createServerFn(this.serverOptions, socket => {
      this.onNewConnection({ socket });
    });

    // Without this listener a failed listen - a port already in use is the commonest boot failure
    // there is - emits an unhandled 'error' event, which takes the whole process down with it.
    this.server.on('error', (error: Error) => {
      this.logger
        .for(this.configure.name)
        .error('TCP Socket Server error | Options: %j | Error: %s', this.listenOptions, error);

      this.invokeHook({
        scope: this.configure.name,
        execution: () => {
          this.onServerError?.({ server: this.server, error });
        },
      });
    });

    this.server.listen(this.listenOptions, () => {
      this.logger
        .for(this.configure.name)
        .info('TCP Socket Server is now listening | Options: %j', this.listenOptions);

      this.invokeHook({
        scope: this.configure.name,
        execution: () => {
          this.onServerReady?.({ server: this.server });
        },
      });
    });
  }

  onNewConnection(opts: { socket: SocketClientType }) {
    const { socket } = opts;

    const id = getUID();

    socket.on('data', (data: Buffer | string) => {
      this.invokeHook({
        scope: 'onClientData',
        execution: () => {
          this.onClientData?.({ id, socket, data });
        },
      });
    });

    socket.on('error', (error: Error) => {
      this.logger.for('onClientConnect').error('Socket Error | ID: %s | Error: %s', id, error);

      this.invokeHook({
        scope: 'onClientError',
        execution: () => {
          this.onClientError?.({ id, socket, error });
        },
      });

      socket.end();
    });

    socket.on('close', (hasError: boolean) => {
      this.logger
        .for('onClientConnect')
        .info('Socket Closed | ID: %s | hasError: %s', id, hasError);

      this.invokeHook({
        scope: 'onClientClose',
        execution: () => {
          this.onClientClose?.({ id, socket });
        },
      });

      const authenticateTimeout = this.getClient({ id })?.storage?.authenticateTimeout;
      if (authenticateTimeout) {
        clearTimeout(authenticateTimeout);
      }

      this.clients = omit(this.clients, [id]);
    });

    for (const extraEvent in this.extraEvents) {
      socket.on(extraEvent, args => {
        voidExecution({
          logger: this.logger,
          scope: 'onClientConnect',
          // The async wrapper turns a SYNCHRONOUS throw from the handler into a rejection;
          // calling it bare would throw out of this listener as an uncaught exception.
          execution: (async () => this.extraEvents[extraEvent]({ id, socket, args }))(),
        });
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

    this.logger
      .for('onClientConnect')
      .info(
        'New TCP SocketClient | Client: %s | authenticateOptions: %s %s',
        `${id} - ${socket.remoteAddress} - ${socket.remotePort} - ${socket.remoteFamily}`,
        this.authenticateOptions.required,
        this.authenticateOptions.duration,
      );

    this.invokeHook({
      scope: 'onClientConnected',
      execution: () => {
        this.onClientConnected?.({ id, socket });
      },
    });

    if (
      this.authenticateOptions.required &&
      this.authenticateOptions.duration &&
      this.authenticateOptions.duration > 0
    ) {
      const authenticateTimeout = setTimeout(() => {
        const client = this.getClient({ id });
        if (!client) {
          return;
        }

        client.storage.authenticateTimeout = null;

        if (client.state === 'authenticated') {
          return;
        }

        this.emit({ clientId: id, payload: 'Unauthorized Client' });
        client.socket.end();
      }, this.authenticateOptions.duration);

      const client = this.getClient({ id });
      if (!client) {
        clearTimeout(authenticateTimeout);
        return;
      }

      client.storage.authenticateTimeout = authenticateTimeout;
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

  /**
   * Tears the server down completely: pending authenticate timers cleared, every client socket
   * destroyed, the registry emptied, then the listener closed.
   *
   * The order is what makes this necessary at all - `server.close()` stops accepting NEW
   * connections but never settles while an existing socket is still attached, so a caller reaching
   * through `getServer().close()` hangs forever on a busy server. Idempotent, and safe on a server
   * that never listened.
   */
  async shutdown(): Promise<void> {
    for (const client of Object.values(this.clients)) {
      const { authenticateTimeout } = client.storage;
      if (authenticateTimeout) {
        clearTimeout(authenticateTimeout);
        client.storage.authenticateTimeout = null;
      }

      client.socket.destroy();
    }

    this.clients = {};

    const server = this.server;
    if (!server) {
      return;
    }

    // NOT guarded on `listening`: listen() is asynchronous (a hostname needs a DNS lookup), so a
    // shutdown() racing startup would see listening === false, close nothing, and let the server
    // bind its port a moment later - keeping the process alive forever. close() on a server that
    // never listened simply reports ERR_SERVER_NOT_RUNNING, which is logged below.

    await new Promise<void>(resolve => {
      server.close(error => {
        if (error) {
          this.logger.for(this.shutdown.name).error('Failed to close server | Error: %s', error);
        }

        resolve();
      });
    });

    this.logger.for(this.shutdown.name).info('Server closed | Identifier: %s', this.identifier);
  }

  doAuthenticate(opts: { id: string; state: 'unauthorized' | 'authenticating' | 'authenticated' }) {
    const { id, state } = opts;

    const client = this.getClient({ id });
    if (!client) {
      this.logger.for('authenticateClient').error('Client NOT FOUND | ID: %s', id);
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

        if (client.storage.authenticateTimeout) {
          clearTimeout(client.storage.authenticateTimeout);
          client.storage.authenticateTimeout = null;
        }
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
      this.logger.for(this.emit.name).error('Client NOT FOUND | ID: %s', clientId);
      return;
    }

    const { socket } = client;
    if (!socket.writable) {
      this.logger.for(this.emit.name).error('Client NOT WRITABLE | ID: %s', clientId);
      return;
    }

    if (!payload?.length) {
      this.logger
        .for(this.emit.name)
        .info(
          '[%s] Client %s | Invalid payload to write to TCP Socket!',
          this.identifier,
          clientId,
        );
      return;
    }

    socket.write(payload);
  }
}
