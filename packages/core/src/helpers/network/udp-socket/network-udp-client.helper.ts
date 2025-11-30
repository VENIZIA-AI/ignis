import { BaseHelper } from '@/base/helpers';
import { ValueOrPromise } from '@/common';
import dgram from 'node:dgram';

interface INetworkUdpClientProps {
  identifier: string;

  host?: string;
  port: number;
  reuseAddr?: boolean;

  multicastAddress?: {
    groups?: Array<string>;
    interface?: string;
  };

  onConnected?: (opts: { identifier: string; host?: string; port: number }) => void;
  onData?: (opts: {
    identifier: string;
    message: string | Buffer;
    remoteInfo: dgram.RemoteInfo;
  }) => void;
  onClosed?: (opts: { identifier: string; host?: string; port: number }) => void;
  onError?: (opts: { identifier: string; host?: string; port: number; error: Error }) => void;
  onBind?: (opts: {
    identifier: string;
    socket: dgram.Socket;
    host?: string;
    port: number;
    reuseAddr?: boolean;
    multicastAddress?: { groups?: Array<string>; interface?: string };
  }) => ValueOrPromise<void>;
}

export class NetworkUdpClient extends BaseHelper {
  private host?: string;
  private port: number;
  private reuseAddr?: boolean;

  private multicastAddress?: {
    groups?: Array<string>;
    interface?: string;
  };

  private onConnected: (opts: { identifier: string; host?: string; port: number }) => void;
  private onData: (opts: {
    identifier: string;
    message: string | Buffer;
    remoteInfo: dgram.RemoteInfo;
  }) => void;
  private onClosed?: (opts: { identifier: string; host?: string; port: number }) => void;
  private onError?: (opts: {
    identifier: string;
    host?: string;
    port: number;
    error: Error;
  }) => void;
  private onBind?: (opts: {
    identifier: string;
    socket: dgram.Socket;
    host?: string;
    port: number;
    reuseAddr?: boolean;
    multicastAddress?: { groups?: Array<string>; interface?: string };
  }) => ValueOrPromise<void>;

  private client?: dgram.Socket | null;

  constructor(opts: INetworkUdpClientProps) {
    super({ scope: NetworkUdpClient.name, identifier: opts.identifier });

    this.host = opts.host;
    this.port = opts.port;
    this.reuseAddr = opts.reuseAddr;
    this.multicastAddress = opts.multicastAddress;

    this.onConnected = opts?.onConnected ?? this.handleConnected;
    this.onData = opts?.onData ?? this.handleData;
    this.onClosed = opts?.onClosed ?? this.handleClosed;
    this.onError = opts?.onError ?? this.handleError;
    this.onBind = opts?.onBind;
  }

  static newInstance(opts: INetworkUdpClientProps) {
    return new NetworkUdpClient(opts);
  }

  getClient() {
    return this.client;
  }

  handleConnected() {
    this.logger.info(
      '[handleConnected][%s] Successfully bind connection | Options: %j',
      this.identifier,
      {
        host: this.host,
        port: this.port,
        multicastAddress: this.multicastAddress,
      },
    );
  }

  handleData(opts: { identifier: string; message: string | Buffer; remoteInfo: dgram.RemoteInfo }) {
    this.logger.info(
      '[handleData][%s][%s:%d][<==] Raw: %s',
      this.identifier,
      this.host,
      this.port,
      {
        message: opts.message,
        remoteInfo: opts.remoteInfo,
      },
    );
  }

  handleClosed() {
    this.logger.info(
      '[handleClosed][%s] Closed connection TCP Server | Options: %j',
      this.identifier,
      {
        host: this.host,
        port: this.port,
        multicastAddress: this.multicastAddress,
      },
    );
  }

  handleError(opts: { identifier: string; error: Error }) {
    this.logger.error(
      '[handleError][%s] Connection error | Options: %j | Error: %s',
      this.identifier,
      {
        host: this.host,
        port: this.port,
      },
      opts.error,
    );
  }

  connect() {
    if (this.client) {
      this.logger.info('[connect][%s] UdpClient is already initialized!', this.identifier);
      return;
    }

    if (!this.port) {
      this.logger.info('[connect][%s] Cannot init UDP Client with null options', this.identifier);
      return;
    }

    this.logger.info(
      '[connect][%s] New network udp client | Host: %s | Port: %s | multicastAddress: %j',
      this.identifier,
      this.host,
      this.port,
      this.multicastAddress,
    );

    this.client = dgram.createSocket({ type: 'udp4', reuseAddr: this.reuseAddr });
    this.client.on('close', () => {
      this.onClosed?.({ identifier: this.identifier, host: this.host, port: this.port });
    });

    this.client.on('error', error => {
      this.onError?.({ identifier: this.identifier, host: this.host, port: this.port, error });
    });

    this.client.on('listening', () => {
      this.onConnected?.({ identifier: this.identifier, host: this.host, port: this.port });
    });

    this.client.on('message', (message: string | Buffer, remoteInfo: dgram.RemoteInfo) => {
      this.onData?.({ identifier: this.identifier, message, remoteInfo });
    });

    this.client.bind({ port: this.port, address: this.host }, () => {
      this.onBind?.({
        identifier: this.identifier,
        socket: this.client!,
        host: this.host,
        port: this.port,
        reuseAddr: this.reuseAddr,
        multicastAddress: this.multicastAddress,
      });
    });
  }

  disconnect() {
    if (!this.client) {
      this.logger.info('[disconnect][%s] UdpClient is not initialized yet!', this.identifier);
      return;
    }

    this.client?.close();

    this.client = null;
    this.logger.info('[disconnect][%s] UdpClient is destroyed!', this.identifier);
  }

  isConnected() {
    return this.client;
  }
}
