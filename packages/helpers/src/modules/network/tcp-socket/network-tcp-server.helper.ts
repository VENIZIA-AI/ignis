import { createServer, ServerOpts, Socket as SocketClient, Server as SocketServer } from 'node:net';
import { BaseNetworkTcpServer, ITcpSocketServerOptions } from './base-tcp-server.helper';

export class NetworkTcpServer extends BaseNetworkTcpServer<ServerOpts, SocketServer, SocketClient> {
  constructor(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>) {
    super({
      ...opts,
      scope: NetworkTcpServer.name,
      createServerFn: createServer,
    });
  }

  static newInstance(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>) {
    return new NetworkTcpServer(opts);
  }
}
