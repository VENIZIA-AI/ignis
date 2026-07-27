import { ValueOrPromise } from '@/common';
import { BaseHelper } from '@/modules/base';
import { voidExecution } from '@/utilities/promise.utility';
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
    this.logger
      .for(this.handleConnected.name)
      .info('[%s] Successfully bind connection | Options: %j', this.identifier, {
        host: this.host,
        port: this.port,
        multicastAddress: this.multicastAddress,
      });
  }

  handleData(opts: { identifier: string; message: string | Buffer; remoteInfo: dgram.RemoteInfo }) {
    this.logger
      .for(this.handleData.name)
      .info('[%s][%s:%d][<==] Raw: %s', this.identifier, this.host, this.port, {
        message: opts.message,
        remoteInfo: opts.remoteInfo,
      });
  }

  handleClosed() {
    this.logger
      .for(this.handleClosed.name)
      .info('[%s] Closed connection UDP Server | Options: %j', this.identifier, {
        host: this.host,
        port: this.port,
        multicastAddress: this.multicastAddress,
      });
  }

  handleError(opts: { identifier: string; error: Error }) {
    this.logger.for(this.handleError.name).error(
      '[%s] Connection error | Options: %j | Error: %s',
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
      this.logger
        .for(this.connect.name)
        .info('[%s] UdpClient is already initialized!', this.identifier);
      return;
    }

    // Port 0 is a VALID request for an OS assigned port - only a missing / negative port is invalid.
    if (!Number.isInteger(this.port) || this.port < 0) {
      this.logger
        .for(this.connect.name)
        .info(
          '[%s] Cannot init UDP Client with invalid port | Port: %s',
          this.identifier,
          this.port,
        );
      return;
    }

    this.logger
      .for(this.connect.name)
      .info(
        '[%s] New network udp client | Host: %s | Port: %s | multicastAddress: %j',
        this.identifier,
        this.host,
        this.port,
        this.multicastAddress,
      );

    this.client = dgram.createSocket({ type: 'udp4', reuseAddr: this.reuseAddr });
    this.client.on('close', () => {
      this.invokeHook({
        scope: this.handleClosed.name,
        execution: () => {
          this.onClosed?.({ identifier: this.identifier, host: this.host, port: this.port });
        },
      });
    });

    this.client.on('error', error => {
      this.invokeHook({
        scope: this.handleError.name,
        execution: () => {
          this.onError?.({ identifier: this.identifier, host: this.host, port: this.port, error });
        },
      });
    });

    this.client.on('listening', () => {
      this.invokeHook({
        scope: this.handleConnected.name,
        execution: () => {
          this.onConnected?.({ identifier: this.identifier, host: this.host, port: this.port });
        },
      });
    });

    this.client.on('message', (message: string | Buffer, remoteInfo: dgram.RemoteInfo) => {
      this.invokeHook({
        scope: this.handleData.name,
        execution: () => {
          this.onData?.({ identifier: this.identifier, message, remoteInfo });
        },
      });
    });

    this.client.bind({ port: this.port, address: this.host }, () => {
      voidExecution({
        logger: this.logger,
        scope: 'bind',
        // The async wrapper turns a SYNCHRONOUS throw from onBind into a rejection; calling it bare would throw out of the dgram listening listener as an uncaught exception.
        execution: (async () =>
          this.onBind?.({
            identifier: this.identifier,
            socket: this.client!,
            host: this.host,
            port: this.port,
            reuseAddr: this.reuseAddr,
            multicastAddress: this.multicastAddress,
          }))(),
      });
    });
  }

  // Hooks run inside dgram event listeners: a synchronous throw there is an uncaught exception.
  private invokeHook(opts: { scope: string; execution: () => void }) {
    const { scope, execution } = opts;

    try {
      execution();
    } catch (error) {
      this.logger.for(scope).error('Hook execution FAILED | Error: %s', error);
    }
  }

  disconnect() {
    if (!this.client) {
      this.logger
        .for(this.disconnect.name)
        .info('[%s] UdpClient is not initialized yet!', this.identifier);
      return;
    }

    this.client?.close();

    this.client = null;
    this.logger.for(this.disconnect.name).info('UdpClient is destroyed! | ID: %s', this.identifier);
  }

  isConnected() {
    return this.client;
  }
}
