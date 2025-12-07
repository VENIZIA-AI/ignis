import { createServer, Server, TLSSocket as SocketClient, TlsOptions } from 'node:tls';
import { BaseNetworkTcpServer, ITcpSocketServerOptions } from './base-tcp-server.helper';

export class NetworkTlsTcpServer extends BaseNetworkTcpServer<TlsOptions, Server, SocketClient> {
  constructor(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>) {
    super({
      ...opts,
      scope: NetworkTlsTcpServer.name,
      createServerFn: createServer,
    });
  }

  static newInstance(opts: Omit<ITcpSocketServerOptions, 'createServerFn'>) {
    return new NetworkTlsTcpServer(opts);
  }
}
