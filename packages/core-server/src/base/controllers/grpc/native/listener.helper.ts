import { HTTP, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError, Execution } from '@venizia/ignis-helpers/core';
import { ErrorPrettier } from '@venizia/ignis-helpers';
import { ToggleUtility } from '@venizia/ignis-kernel';
import type {
  Http2Server,
  Http2ServerRequest,
  Http2ServerResponse,
  ServerHttp2Session,
} from 'node:http2';
import type { Socket } from 'node:net';
import { GrpcNativeCallStore } from './call.store';
import type { IGrpcNativeOptions } from './common/types';
import { GrpcHeaderUtility } from './header.utility';
import { GrpcNativeWriter } from './native.writer';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_CONCURRENT_STREAMS = 100;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
/** What aborted calls get to write their answer before the connections are destroyed. */
const ABORT_GRACE_MS = 1_000;
const MAX_PORT = 65_535;
const TLS_OPTION = { name: '[GrpcListenerHelper] native.tls' };
/** The largest `maxConcurrentStreams` an HTTP/2 SETTINGS frame carries; a larger value fails every connection. */
const MAX_CONCURRENT_STREAMS = 4_294_967_295;
/** The largest delay a timer takes; a larger one fires at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** The method every gRPC call uses. */
const GRPC_METHOD = 'POST';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
/** The origin of the request built for Hono. A constant, so a caller never chooses it. */
const ORIGIN = 'http://grpc.internal';

/** What a native gRPC listener is built from. */
export interface IGrpcListenerOptions {
  options: IGrpcNativeOptions;
  /** `/package.Service/Method` to the path the RPC is mounted at in the application. */
  routes: Map<string, string>;
  /** The `fetch` the HTTP server runs, so global middleware sees every call. */
  fetch: (request: Request, env: object) => ValueOrPromise<Response>;
  /** The idle timeout of a stream, the one of the HTTP server; `0` is none. */
  idleTimeoutMs: number;
  /** Aborted when `stop()` runs out of time: every handler's `rpc.signal` follows it. */
  shutdown: AbortController;
}

/**
 * The native gRPC port: a `node:http2` server that passes each call through the application with its headers only, and
 * lets the RPC's route write the answer, trailers included, on the stream. Only RPC paths are served, with POST.
 */
export class GrpcListenerHelper extends BaseHelper {
  private server?: Http2Server;
  private readonly sessions = new Set<ServerHttp2Session>();
  /** Every TCP connection, one that never finished its TLS handshake included: no session ever stands for it. */
  private readonly sockets = new Set<Socket>();
  /** The shutdown in progress, which a second `stop()` waits for. */
  private stopping?: Promise<void>;
  /** Called when the last session closed, while stopping. */
  private onDrained?: () => void;

  constructor(private readonly listener: IGrpcListenerOptions) {
    super({ scope: GrpcListenerHelper.name });

    this.assertOptions();
  }

  /** The address the listener is bound to; `undefined` until `start()`. */
  getAddress(): { host: string; port: number } | undefined {
    const address = this.server?.address();

    if (!address || typeof address === 'string') {
      return undefined;
    }

    return { host: address.address, port: address.port };
  }

  /** Binds the port. A port in use rejects. */
  async start() {
    const { port, tls, limits } = this.listener.options;
    // As the HTTP server reads it: an empty host is no host, and never "every interface".
    const host = this.listener.options.host || DEFAULT_HOST;
    const http2 = await import('node:http2');
    const settings = {
      maxConcurrentStreams: limits?.concurrentStreams ?? DEFAULT_CONCURRENT_STREAMS,
    };

    const onRequest = (request: Http2ServerRequest, response: Http2ServerResponse) => {
      this.onRequest({ request, response });
    };

    const server = ToggleUtility.isUsed(tls, TLS_OPTION)
      ? http2.createSecureServer(
          { settings, allowHTTP1: false, key: tls.key, cert: tls.cert },
          onRequest,
        )
      : http2.createServer({ settings }, onRequest);

    server.on('session', (session: ServerHttp2Session) => {
      this.sessions.add(session);
      session.once('close', () => {
        this.sessions.delete(session);

        if (this.sessions.size === 0) {
          this.onDrained?.();
        }
      });
    });
    server.on('connection', (socket: Socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    server.on('error', (error: Error) => {
      this.logger
        .for('server')
        .error('Native gRPC server error | %s', ErrorPrettier.format({ error }));
    });

    const logger = this.logger.for(this.start.name);
    logger.info('Native gRPC STARTED | address: %s:%s', host, this.getAddress()?.port);

    if (!ToggleUtility.isUsed(tls, TLS_OPTION) && !LOOPBACK_HOSTS.has(host)) {
      logger.info('Native gRPC is clear text (h2c) on %s: it expects a mesh or a TLS proxy', host);
    }
  }

  /**
   * Stops accepting, asks every connection to finish, waits `shutdownTimeout`, then aborts what still runs and
   * destroys the connections. A second call waits for the same shutdown.
   */
  async stop() {
    const { server } = this;

    if (server) {
      this.server = undefined;
      this.stopping = this.shutDown({ server });
    }

    await this.stopping;
  }

  private async shutDown(opts: { server: Http2Server }) {
    const closed = new Promise<void>((resolve) => {
      opts.server.close(() => resolve());
    });
    const drained = new Promise<void>((resolve) => {
      this.onDrained = resolve;

      if (this.sessions.size === 0) {
        resolve();
      }
    });

    for (const session of this.sessions) {
      session.close();
    }

    const timeout = this.listener.options.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    await this.settle({ task: drained, ms: timeout });

    if (this.sessions.size > 0) {
      this.logger
        .for(this.stop.name)
        .warn('Native gRPC calls still running after %s ms | aborting them', timeout);
      this.listener.shutdown.abort();
      await this.settle({ task: drained, ms: ABORT_GRACE_MS });
    }

    for (const session of this.sessions) {
      session.destroy();
    }

    // No call is left: what remains is a connection with no session, which `close()` would wait on.
    for (const socket of this.sockets) {
      socket.destroy();
    }

    await this.settle({ task: closed, ms: ABORT_GRACE_MS });
  }

  /** Waits for `task`, at most `ms`; the caller reads whether it finished. */
  private async settle(opts: { task: Promise<void>; ms: number }) {
    try {
      await Execution.withTimeout({ call: () => opts.task, timeoutMs: opts.ms });
    } catch (error) {
      this.logger.for(this.settle.name).debug('Not finished in time | %s', error);
    }
  }

  private onRequest(opts: { request: Http2ServerRequest; response: Http2ServerResponse }) {
    const { request, response } = opts;
    const { stream } = request;
    const { idleTimeoutMs } = this.listener;

    // The idle timeout of the HTTP server, until a call passes its middlewares (GrpcTimeoutGuard).
    if (idleTimeoutMs > 0) {
      stream.setTimeout(idleTimeoutMs, () => stream.close());
    }

    this.serve({ request, response }).catch((error: unknown) => {
      this.logger
        .for('serve')
        .error(
          'Native gRPC call failed | path: %s\n%s',
          request.url,
          ErrorPrettier.format({ error }),
        );
      stream.close();
    });
  }

  private async serve(opts: { request: Http2ServerRequest; response: Http2ServerResponse }) {
    const { request, response } = opts;
    const mounted = this.listener.routes.get(request.url);

    if (request.method !== GRPC_METHOD || !mounted) {
      GrpcNativeWriter.refuse({
        response,
        status: HTTP.ResultCodes.RS_4.NotFound,
        message: 'Unknown method',
      });

      return;
    }

    const left = new AbortController();
    request.stream.once('aborted', () => left.abort());

    const headers = GrpcHeaderUtility.fromNode({ headers: request.headers });
    headers.set('host', request.authority);

    const answer = await this.listener.fetch(
      new Request(`${ORIGIN}${mounted}`, {
        method: GRPC_METHOD,
        headers,
        signal: left.signal,
      }),
      new GrpcNativeCallStore({ request, response }),
    );

    // The RPC's route wrote on the stream. Anything else answered the call before ConnectRPC saw it.
    if (response.headersSent || request.stream.closed) {
      return;
    }

    await GrpcNativeWriter.refuseFrom({ response, answer });
  }

  private assertOptions() {
    const { port, limits, shutdownTimeout, tls } = this.listener.options;

    const refuse = (message: string) => {
      throw getError({ message: `[GrpcListenerHelper] ${message}` });
    };

    if (!Number.isInteger(port) || port < 0 || port > MAX_PORT) {
      refuse(`native.port must be a port number | value: ${String(port)}`);
    }

    const streams = limits?.concurrentStreams ?? DEFAULT_CONCURRENT_STREAMS;

    if (!Number.isInteger(streams) || streams <= 0 || streams > MAX_CONCURRENT_STREAMS) {
      refuse(
        `native.limits.concurrentStreams must be an integer from 1 to ${MAX_CONCURRENT_STREAMS} | value: ${String(streams)}`,
      );
    }

    const timeout = shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > MAX_TIMEOUT_MS) {
      refuse(
        `native.shutdownTimeout must be a positive number of milliseconds, at most ${MAX_TIMEOUT_MS} | value: ${String(timeout)}`,
      );
    }

    const host: unknown = this.listener.options.host;

    if (host !== undefined && host !== null && typeof host !== 'string') {
      refuse(`native.host must be a string | value: ${String(host)}`);
    }

    if (ToggleUtility.isUsed(tls, TLS_OPTION) && (!tls.key || !tls.cert)) {
      refuse('native.tls needs key and cert');
    }
  }
}
