import {
  createServer,
  type Server,
  type TLSSocket as SocketClient,
  type TlsOptions,
} from 'node:tls';
import { BaseNetworkTcpServer, type ITcpSocketServerOptions } from './base-tcp-server.helper';

type TTlsTcpServerOptions = Omit<
  ITcpSocketServerOptions<TlsOptions, Server, SocketClient>,
  'createServerFn'
>;

export class NetworkTlsTcpServer extends BaseNetworkTcpServer<TlsOptions, Server, SocketClient> {
  constructor(opts: TTlsTcpServerOptions) {
    super({
      ...opts,
      scope: NetworkTlsTcpServer.name,
      createServerFn: createServer,
    });
  }

  static newInstance(opts: TTlsTcpServerOptions) {
    return new NetworkTlsTcpServer(opts);
  }
}
