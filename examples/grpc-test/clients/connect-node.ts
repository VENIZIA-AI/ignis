// `bun run client:connect` - the tour with @connectrpc/connect-node.
//   (no flag)   Connect protocol on the application port
//   --grpc-web  gRPC-Web on the application port
//   --native    native gRPC on its own port (h2c); add --tls when the server runs with TLS
import { BearerToken } from '@clients/bearer-token';
import { ClientSettings } from '@clients/client-settings';
import { NotesTour } from '@clients/tour';
import type { Transport } from '@connectrpc/connect';
import {
  createConnectTransport,
  createGrpcTransport,
  createGrpcWebTransport,
} from '@connectrpc/connect-node';

const isNative = ClientSettings.hasFlag({ name: 'native' });
const isGrpcWeb = ClientSettings.hasFlag({ name: 'grpc-web' });
const isTls = ClientSettings.hasFlag({ name: 'tls' });

const apiPort = ClientSettings.readPort({ key: 'APP_ENV_SERVER_PORT', fallback: '3000' });
const grpcPort = ClientSettings.readPort({ key: 'APP_ENV_GRPC_PORT', fallback: '50051' });
// The application port keeps the base path and the controller path.
const apiUrl = `http://127.0.0.1:${apiPort}/api/grpc`;
// The native port has neither: a gRPC client calls `/package.Service/Method`.
const nativeUrl = `${isTls ? 'https' : 'http'}://127.0.0.1:${grpcPort}`;

const transport = (opts: { token?: string }): Transport => {
  const interceptors = [BearerToken.interceptor({ read: () => opts.token })];

  if (isNative) {
    return createGrpcTransport({
      baseUrl: nativeUrl,
      interceptors,
      nodeOptions: isTls ? { ca: ClientSettings.readCertificate() } : {},
    });
  }

  if (isGrpcWeb) {
    return createGrpcWebTransport({ baseUrl: apiUrl, httpVersion: '1.1', interceptors });
  }

  return createConnectTransport({ baseUrl: apiUrl, httpVersion: '1.1', interceptors });
};

await NotesTour.run({
  transport,
  password: ClientSettings.readPassword(),
  isBidi: isNative,
  log: (line) => process.stdout.write(`${line}\n`),
});
process.exit(0);
