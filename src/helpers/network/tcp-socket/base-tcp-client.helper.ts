import { BaseHelper } from '@/base/helpers';
import { ValueOrPromise } from '@/common';
import isEmpty from 'lodash/isEmpty';
import {
  TcpSocketConnectOpts as PlainConnectionOptions,
  Socket as PlainSocketClient,
} from 'node:net';
import { ConnectionOptions as TlsConnectionOptions, TLSSocket as TlsSocketClient } from 'node:tls';

const DEFAULT_MAX_RETRY = 5;

export interface INetworkTcpClientProps<
  SocketClientOptions extends PlainConnectionOptions | TlsConnectionOptions,
  SocketClientType extends PlainSocketClient | TlsSocketClient,
> {
  // props
  identifier: string;
  scope?: string;

  options: SocketClientOptions;
  reconnect?: boolean;
  maxRetry?: number;
  encoding?: BufferEncoding;

  createClientFn: (
    options: SocketClientOptions,
    connectionListener?: () => void,
  ) => SocketClientType;

  // handlers
  onConnected?: (opts: { client: SocketClientType }) => ValueOrPromise<void>;
  onData?: (opts: { identifier: string; message: string | Buffer }) => ValueOrPromise<void>;
  onClosed?: (opts: { client: SocketClientType }) => void;
  onError?: (error: any) => void;
}

export class BaseNetworkTcpClient<
  SocketClientOptions extends PlainConnectionOptions | TlsConnectionOptions,
  SocketClientType extends PlainSocketClient | TlsSocketClient,
> extends BaseHelper {
  protected client?: SocketClientType | null;

  protected options: SocketClientOptions;
  protected reconnect?: boolean;
  protected retry: { maxReconnect: number; currentReconnect: number } = {
    maxReconnect: DEFAULT_MAX_RETRY,
    currentReconnect: 0,
  };
  protected reconnectTimeout: any;
  protected encoding?: BufferEncoding;

  protected createClientFn: (
    options: SocketClientOptions,
    connectionListener?: () => void,
  ) => SocketClientType;

  // handlers
  protected onConnected: (opts: { client: SocketClientType }) => void;
  protected onData: (opts: { identifier: string; message: string | Buffer }) => void;
  protected onClosed?: (opts: { client: SocketClientType }) => void;
  protected onError?: (error: any) => void;

  constructor(opts: INetworkTcpClientProps<SocketClientOptions, SocketClientType>) {
    super({
      scope: opts.scope ?? opts.identifier ?? BaseNetworkTcpClient.name,
      identifier: opts.identifier,
    });
    this.options = opts.options;

    this.retry = {
      maxReconnect: opts.maxRetry ?? DEFAULT_MAX_RETRY,
      currentReconnect: 0,
    };

    this.createClientFn = opts.createClientFn;

    this.onConnected = opts?.onConnected ?? this.handleConnected;
    this.onData = opts?.onData ?? this.handleData;
    this.onClosed = opts?.onClosed ?? this.handleClosed;
    this.onError = opts?.onError ?? this.handleError;
    this.reconnect = opts?.reconnect ?? false;
    this.encoding = opts?.encoding;
  }

  getClient() {
    return this.client;
  }

  handleConnected() {
    this.logger.info(
      '[handleConnected][%s] Connected to TCP Server | Options: %j',
      this.identifier,
      this.options,
    );
    this.retry.currentReconnect = 0;
  }

  handleData(_opts: { identifier: string; message: string | Buffer }) {}

  handleClosed() {
    this.logger.info(
      '[handleClosed][%s] Closed connection TCP Server | Options: %j',
      this.identifier,
      this.options,
    );
  }

  handleError(error: any) {
    this.logger.error(
      '[handleError][%s] Connection error | Options: %j | Error: %s',
      this.identifier,
      this.options,
      error,
    );

    if (!this.reconnect || this.retry.currentReconnect >= this.retry.maxReconnect) {
      return;
    }

    const { currentReconnect, maxReconnect } = this.retry;
    if (maxReconnect > -1 && currentReconnect >= maxReconnect) {
      this.logger.info(
        '[handleData] Exceeded max retry to reconnect! Max: %d | Current: %d',
        maxReconnect,
        currentReconnect,
      );
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.client?.destroy();
      this.client = null;

      this.logger.info(
        '[handleClosed][%s] Retrying to establish TCP Connection | Options: %j',
        this.identifier,
        this.options,
      );

      this.connect({ resetReconnectCounter: false });
      this.retry.currentReconnect++;
    }, 5000);
  }

  connect(opts: { resetReconnectCounter: boolean }) {
    if (this.isConnected()) {
      this.logger.info('[connect][%s] NetworkTcpClient is already initialized!', this.identifier);
      return;
    }

    if (isEmpty(this.options)) {
      this.logger.info('[connect][%s] Cannot init TCP Client with null options', this.identifier);
      return;
    }

    this.logger.info(
      '[connect][%s] New network tcp client | Options: %s',
      this.identifier,
      this.options,
    );

    if (opts?.resetReconnectCounter) {
      this.retry.currentReconnect = 0;
    }

    if (this.client !== null && this.client !== undefined) {
      this.client?.destroy();
      this.client = null;
    }

    this.client = this.createClientFn(this.options, () => {
      if (!this.client) {
        this.logger.error('[createClientFn] Failed to initialize socket client!');
        return;
      }

      this.onConnected?.({ client: this.client });
    });

    if (this.encoding) {
      this.client.setEncoding(this.encoding);
    }

    this.client.on('data', (message: string | Buffer) => {
      this.onData({ identifier: this.identifier, message });
    });

    this.client.on('close', () => {
      if (!this.client) {
        return;
      }

      this.onClosed?.({ client: this.client });
    });

    this.client.on('error', error => {
      this.onError?.(error);
    });
  }

  disconnect() {
    if (!this.client) {
      this.logger.info(
        '[disconnect][%s] NetworkTcpClient is not initialized yet!',
        this.identifier,
      );
      return;
    }

    this.client?.destroy();
    this.client = null;

    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = null;
    this.logger.info('[disconnect][%s] NetworkTcpClient is destroyed!', this.identifier);
  }

  forceReconnect() {
    this.disconnect();
    this.connect({ resetReconnectCounter: true });
  }

  isConnected() {
    return this.client && this.client.readyState !== 'closed';
  }

  emit(opts: { payload: Buffer | string }) {
    if (!this.client) {
      this.logger.info('[emit][%s] TPC Client is not configured yet!', this.identifier);
      return;
    }

    const { payload } = opts;
    if (!payload?.length) {
      this.logger.info('[emit][%s] Invalid payload to write to TCP Socket!', this.identifier);
      return;
    }

    this.client.write(payload);
  }
}
