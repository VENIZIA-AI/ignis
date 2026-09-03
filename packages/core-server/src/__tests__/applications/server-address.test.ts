import 'reflect-metadata';

import { ServerApplication } from '@/base/applications';
import type { IServerApplicationConfigs } from '@/base/applications';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const DEFAULT_SERVER_HOST = 'localhost';
const DEFAULT_SERVER_PORT = 3000;

/** The three env names the address falls back to, cleared per test so a developer's shell cannot decide the outcome. */
const ADDRESS_ENV_KEYS = ['HOST', 'APP_ENV_SERVER_HOST', 'PORT', 'APP_ENV_SERVER_PORT'];

class AddressApplication extends ServerApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'address-app', version: '0.0.0', description: 'Address resolution probe' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

const buildConfigs = (opts?: Partial<IServerApplicationConfigs>): IServerApplicationConfigs => {
  return { path: { base: '/', isStrict: false }, ...opts };
};

const buildApplication = (opts?: Partial<IServerApplicationConfigs>): AddressApplication => {
  return new AddressApplication({ scope: AddressApplication.name, config: buildConfigs(opts) });
};

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ADDRESS_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ADDRESS_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = savedEnv[key];
  }
});

/**
 * Address resolution lives HERE, not in the kernel: only this layer binds a socket. The kernel
 * carries no `host`/`port` at all, so a browser Worker can no longer be silently configured with
 * `localhost:3000`.
 */
describe('ServerApplication - address resolution', () => {
  test('with no config and no env, it falls back to localhost:3000', () => {
    const configs = buildApplication().getProjectConfigs() as IServerApplicationConfigs;

    expect(configs.host).toBe(DEFAULT_SERVER_HOST);
    expect(configs.port).toBe(DEFAULT_SERVER_PORT);
    expect(buildApplication().getServerAddress()).toBe(
      `${DEFAULT_SERVER_HOST}:${DEFAULT_SERVER_PORT}`,
    );
  });

  test('env supplies both when config does not', () => {
    process.env.APP_ENV_SERVER_HOST = 'env-host';
    process.env.APP_ENV_SERVER_PORT = '4567';

    const application = buildApplication();

    expect(application.getServerHost()).toBe('env-host');
    expect(application.getServerPort()).toBe(4567);
  });

  test('an explicit config wins over env', () => {
    process.env.APP_ENV_SERVER_HOST = 'env-host';
    process.env.APP_ENV_SERVER_PORT = '4567';

    const application = buildApplication({ host: '127.0.0.1', port: 8080 });

    expect(application.getServerHost()).toBe('127.0.0.1');
    expect(application.getServerPort()).toBe(8080);
  });
});

/**
 * Port candidates are rejected on VALIDITY, never on falsiness. `0` is the request every test server
 * in this repository makes - "give me an ephemeral port" - and a truthiness check turns it into
 * 3000, which fails only when two suites collide on a busy machine.
 */
describe('ServerApplication - port resolution is validity, not falsiness', () => {
  test('port 0 survives as 0, and is not replaced by the default', () => {
    expect(buildApplication({ port: 0 }).getServerPort()).toBe(0);
  });

  test('a numeric string port is parsed', () => {
    expect(buildApplication({ port: '8080' as unknown as number }).getServerPort()).toBe(8080);
  });

  test.each([
    ['not-a-port', 'a non-numeric string'],
    ['tcp://172.17.0.5:8080', "Docker's legacy container-link URL form"],
    ['', 'an empty string'],
    ['  ', 'whitespace only'],
    [-1, 'a negative port'],
    [65536, 'a port above the 16-bit range'],
    [3000.5, 'a non-integer port'],
  ])('%p is rejected (%s) and falls through to the default', unusable => {
    expect(buildApplication({ port: unusable as unknown as number }).getServerPort()).toBe(
      DEFAULT_SERVER_PORT,
    );
  });

  test('an unusable config port falls through to ENV rather than straight to the default', () => {
    process.env.APP_ENV_SERVER_PORT = '4567';

    expect(buildApplication({ port: 'not-a-port' as unknown as number }).getServerPort()).toBe(
      4567,
    );
  });

  test('an unusable PORT does not shadow a usable APP_ENV_SERVER_PORT', () => {
    // The bug this ordering exists for: `PORT=tcp://...` under Docker's legacy container links used
    // to win on truthiness and bind 3000, ignoring the port the operator actually set.
    process.env.PORT = 'tcp://172.17.0.5:8080';
    process.env.APP_ENV_SERVER_PORT = '8080';

    expect(buildApplication().getServerPort()).toBe(8080);
  });
});
