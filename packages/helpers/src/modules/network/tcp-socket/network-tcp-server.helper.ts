import {
  createServer,
  type ServerOpts,
  type Socket as SocketClient,
  type Server as SocketServer,
} from 'node:net';
import { BaseNetworkTcpServer, type ITcpSocketServerOptions } from './base-tcp-server.helper';

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
