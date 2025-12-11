import { connect, Socket, TcpSocketConnectOpts } from 'node:net';
import { BaseNetworkTcpClient, INetworkTcpClientProps } from './base-tcp-client.helper';

export class NetworkTcpClient extends BaseNetworkTcpClient<TcpSocketConnectOpts, Socket> {
  constructor(opts: Omit<INetworkTcpClientProps<TcpSocketConnectOpts, Socket>, 'createClientFn'>) {
    super({
      ...opts,
      scope: NetworkTcpClient.name,
      createClientFn: connect,
    });
    this.options = opts.options;
  }

  static newInstance(
    opts: Omit<INetworkTcpClientProps<TcpSocketConnectOpts, Socket>, 'createClientFn'>,
  ) {
    return new NetworkTcpClient(opts);
  }
}
