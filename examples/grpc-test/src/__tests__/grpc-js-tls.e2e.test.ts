// `bun run client:grpc-js --tls` against `bun run src/index.ts` with TLS on: both as processes of their own.
import { EnvKeys } from '@/common/env-keys';
import { Execution, getError } from '@venizia/ignis-helpers';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const folder = mkdtempSync(path.join(tmpdir(), 'grpc-test-tls-'));

/** A port nothing listens on: the client has to be told which one the server takes. */
const freePort = async () => {
  const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response() });
  const { port } = probe;
  await probe.stop(true);

  return String(port);
};

let env: Record<string, string | undefined> = {};
let server: Bun.Subprocess | undefined;

/** Whether the native port takes a connection yet. */
const isListening = () => {
  return Bun.connect({
    hostname: '127.0.0.1',
    port: Number(env[EnvKeys.APP_ENV_GRPC_PORT]),
    socket: { data: () => {} },
  }).then(
    (socket) => {
      socket.end();

      return true;
    },
    () => false,
  );
};

beforeAll(async () => {
  const generated = Bun.spawnSync(['sh', 'scripts/generate-certs.sh', folder]);

  if (generated.exitCode !== 0) {
    throw getError({
      message: `The test certificate was not made | ${generated.stderr.toString()}`,
    });
  }

  const serverPort = await freePort();
  const grpcPort = await freePort();
  env = {
    ...process.env,
    NODE_ENV: 'development',
    APP_ENV_APPLICATION_NAME: 'grpc_test',
    APP_ENV_SERVER_HOST: '127.0.0.1',
    APP_ENV_SERVER_PORT: serverPort,
    APP_ENV_LOGGER_FOLDER_PATH: path.join(folder, 'logs'),
    APP_ENV_PGLITE_DATA_DIR: '',
    [EnvKeys.APP_ENV_JWT_SECRET]: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    [EnvKeys.APP_ENV_DEMO_PASSWORD]: crypto.randomUUID(),
    [EnvKeys.APP_ENV_GRPC_HOST]: '127.0.0.1',
    [EnvKeys.APP_ENV_GRPC_PORT]: grpcPort,
    [EnvKeys.APP_ENV_GRPC_TLS]: 'true',
    [EnvKeys.APP_ENV_GRPC_TLS_KEY]: path.join(folder, 'server.key'),
    [EnvKeys.APP_ENV_GRPC_TLS_CERT]: path.join(folder, 'server.crt'),
  };
  server = Bun.spawn([process.execPath, 'src/index.ts'], { env, stdout: 'ignore' });

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const isReady = await isListening();

    if (isReady) {
      return;
    }

    await Execution.sleep({ ms: 100 });
  }

  throw getError({ message: 'The native port did not open within 30 s' });
}, 40_000);

afterAll(async () => {
  server?.kill();
  await server?.exited;
  rmSync(folder, { recursive: true, force: true });
});

describe('@grpc/grpc-js over TLS', () => {
  test('client:grpc-js --tls runs its four calls', async () => {
    const client = Bun.spawn([process.execPath, 'clients/grpc-js.ts', '--tls'], {
      env,
      stderr: 'pipe',
    });
    const [output, failure, exitCode] = await Promise.all([
      new Response(client.stdout).text(),
      new Response(client.stderr).text(),
      client.exited,
    ]);

    expect(failure).toBe('');
    expect(exitCode).toBe(0);
    expect(output).toContain('bidi stream: a=');
  }, 30_000);
});
