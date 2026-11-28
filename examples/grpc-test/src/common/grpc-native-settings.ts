import { EnvKeys } from '@/common/env-keys';
import type { TToggle } from '@venizia/ignis';
import type { IGrpcNativeOptions } from '@venizia/ignis/grpc';
import { AppEnvs, getError, ParseUtility } from '@venizia/ignis-helpers';
import { existsSync, readFileSync } from 'node:fs';

/** The native gRPC port, read from the environment. */
export class GrpcNativeSettings {
  static read(): TToggle<IGrpcNativeOptions> {
    return {
      use: true,
      // `0` takes a free port; the listener's `getAddress()` answers it.
      port: GrpcNativeSettings.readNumber({ key: EnvKeys.APP_ENV_GRPC_PORT, fallback: 50_051 }),
      host: AppEnvs.get(EnvKeys.APP_ENV_GRPC_HOST, { defaultValue: '127.0.0.1' }),
      tls: GrpcNativeSettings.readTls(),
      shutdownTimeout: GrpcNativeSettings.readNumber({
        key: EnvKeys.APP_ENV_GRPC_SHUTDOWN_TIMEOUT_MS,
        fallback: 5_000,
      }),
      limits: {
        concurrentStreams: GrpcNativeSettings.readNumber({
          key: EnvKeys.APP_ENV_GRPC_MAX_STREAMS,
          fallback: 100,
        }),
      },
    };
  }

  private static readNumber(opts: { key: string; fallback: number }) {
    return ParseUtility.toNumber({ input: AppEnvs.get(opts.key) }) ?? opts.fallback;
  }

  private static readTls(): TToggle<{ key: Buffer; cert: Buffer }> {
    const isUsed = ParseUtility.toBoolean({
      input: AppEnvs.get(EnvKeys.APP_ENV_GRPC_TLS),
      name: EnvKeys.APP_ENV_GRPC_TLS,
    });

    if (!isUsed) {
      return { use: false };
    }

    return {
      use: true,
      key: GrpcNativeSettings.readPem({
        path: AppEnvs.get(EnvKeys.APP_ENV_GRPC_TLS_KEY, { defaultValue: './certs/server.key' }),
      }),
      cert: GrpcNativeSettings.readPem({
        path: AppEnvs.get(EnvKeys.APP_ENV_GRPC_TLS_CERT, { defaultValue: './certs/server.crt' }),
      }),
    };
  }

  private static readPem(opts: { path: string }) {
    if (!existsSync(opts.path)) {
      throw getError({
        message: `[GrpcNativeSettings] TLS is on and ${opts.path} does not exist | run: bun run certs`,
      });
    }

    return readFileSync(opts.path);
  }
}
