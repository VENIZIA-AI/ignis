import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { EnvironmentKeys } from '@/common/environments';
import { ControllerTransports } from '@venizia/ignis-kernel';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterEach, describe, expect, test } from 'bun:test';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class BannerApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'banner-app', version: '0.0.0', description: 'Startup banner' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** The banner is `protected` and log-only, so the lines it writes are the observable contract. */
const captureBanner = (): string[] => {
  const application = new BannerApplication({ scope: 'BannerApp', config: TEST_CONFIGS });
  const lines: string[] = [];
  const record = (message: string, ...args: unknown[]) => {
    lines.push(args.reduce<string>((text, value) => text.replace('%s', String(value)), message));
  };

  application['logger'] = { for: () => ({ info: record, debug: () => {} }) } as AnyType;
  application['printStartUpInfo']({ scope: 'BannerApp' });

  return lines;
};

/**
 * Only the timezone: `APP_ENV_APPLICATION_NAME` is also read at MODULE load by `AppConstants`, and
 * test files share one `process.env`, so writing it here could reach another file in the worker.
 */
const ENV_KEYS = [EnvironmentKeys.APP_ENV_APPLICATION_TIMEZONE];

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('the startup banner reads the env names the framework publishes', () => {
  /**
   * An application loads its `.env` in its own entrypoint, which runs AFTER this module is
   * imported - a value destructured at module load would print the default for a host that
   * configured everything correctly.
   */
  test('a variable exported after import time is still picked up', () => {
    process.env[EnvironmentKeys.APP_ENV_APPLICATION_TIMEZONE] = 'Europe/Paris';

    expect(captureBanner()).toContain('Timezone: Europe/Paris');
  });

  test('an unset variable reports the default', () => {
    expect(captureBanner()).toContain('Timezone: Asia/Ho_Chi_Minh');
  });

  /**
   * A deployment file that carries `APP_ENV_APPLICATION_TIMEZONE=` is a pipeline that forgot to
   * export the value. Read with `??` it wins over the default and the banner prints `Timezone: `.
   */
  test('a present-but-empty variable reports the default, not a blank', () => {
    process.env[EnvironmentKeys.APP_ENV_APPLICATION_TIMEZONE] = '';

    expect(captureBanner()).toContain('Timezone: Asia/Ho_Chi_Minh');
  });

  test('a whitespace-only variable reports the default too', () => {
    process.env[EnvironmentKeys.APP_ENV_APPLICATION_TIMEZONE] = '   ';

    expect(captureBanner()).toContain('Timezone: Asia/Ho_Chi_Minh');
  });

  /**
   * `APP_ENV_APPLICATION_DS_MIGRATION` and `_DS_AUTHORIZE` named a datasource that nothing
   * resolved - the pair reached this log line and nowhere else, so both the line and the
   * constants are gone rather than renamed.
   */
  test('no line claims a datasource the framework never resolves', () => {
    process.env.APP_ENV_APPLICATION_DS_MIGRATION = 'pg_core';

    expect(captureBanner().some(line => line.startsWith('Datasource |'))).toBe(false);

    delete process.env.APP_ENV_APPLICATION_DS_MIGRATION;
  });
});
