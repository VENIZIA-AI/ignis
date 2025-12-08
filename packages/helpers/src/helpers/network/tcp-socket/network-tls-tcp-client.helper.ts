import { connect, ConnectionOptions, TLSSocket } from 'node:tls';
import { BaseNetworkTcpClient, INetworkTcpClientProps } from './base-tcp-client.helper';

export class NetworkTlsTcpClient extends BaseNetworkTcpClient<ConnectionOptions, TLSSocket> {
  constructor(opts: Omit<INetworkTcpClientProps<ConnectionOptions, TLSSocket>, 'createClientFn'>) {
    super({
      ...opts,
      scope: NetworkTlsTcpClient.name,
      createClientFn: connect,
    });
    this.options = opts.options;
  }

  static newInstance(
    opts: Omit<INetworkTcpClientProps<ConnectionOptions, TLSSocket>, 'createClientFn'>,
  ) {
    return new NetworkTlsTcpClient(opts);
  }
}
