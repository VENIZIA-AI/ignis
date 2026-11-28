import { AppEnvs, getError } from '@venizia/ignis-helpers';
import { existsSync, readFileSync } from 'node:fs';

/** The command-line flags and files the Node clients share. */
export class ClientSettings {
  static hasFlag(opts: { name: string }) {
    return Bun.argv.includes(`--${opts.name}`);
  }

  static readPassword() {
    return AppEnvs.getRequired('APP_ENV_DEMO_PASSWORD');
  }

  static readPort(opts: { key: string; fallback: string }) {
    return AppEnvs.get(opts.key, { defaultValue: opts.fallback });
  }

  /** The self-signed certificate of `bun run certs`: a client has to be told to trust it. */
  static readCertificate() {
    const path = AppEnvs.get('APP_ENV_GRPC_TLS_CERT', { defaultValue: './certs/server.crt' });

    if (!existsSync(path)) {
      throw getError({ message: `[ClientSettings] ${path} does not exist | run: bun run certs` });
    }

    return readFileSync(path);
  }
}
