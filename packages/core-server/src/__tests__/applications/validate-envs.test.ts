import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { applicationEnvironment } from '@venizia/ignis-helpers';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class EnvApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'env-app', version: '0.0.0', description: 'Env validation' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

const EMPTY_KEY = 'APP_ENV_VALIDATE_PROBE_EMPTY';

/** `validateEnvs` is protected and the boot sequence is what normally calls it. */
const validate = () => {
  const application = new EnvApplication({ scope: 'EnvApp', config: TEST_CONFIGS });
  return () => application['validateEnvs']();
};

describe('validateEnvs and the ALLOW_EMPTY_ENV_VALUE default', () => {
  beforeEach(() => {
    applicationEnvironment.set(EMPTY_KEY, '');
  });

  afterEach(() => {
    applicationEnvironment.set(EMPTY_KEY, undefined);
    delete process.env.ALLOW_EMPTY_ENV_VALUE;
  });

  test('an empty value is ALLOWED when ALLOW_EMPTY_ENV_VALUE is unset - that is the default', () => {
    delete process.env.ALLOW_EMPTY_ENV_VALUE;

    expect(validate()).not.toThrow();
  });

  test('a blank ALLOW_EMPTY_ENV_VALUE reads as unset, so the default still applies', () => {
    process.env.ALLOW_EMPTY_ENV_VALUE = '';

    expect(validate()).not.toThrow();
  });

  test('ALLOW_EMPTY_ENV_VALUE=false turns validation ON and the empty value throws', () => {
    process.env.ALLOW_EMPTY_ENV_VALUE = 'false';

    expect(validate()).toThrow(EMPTY_KEY);
  });

  test('ALLOW_EMPTY_ENV_VALUE=0 turns validation ON too', () => {
    process.env.ALLOW_EMPTY_ENV_VALUE = '0';

    expect(validate()).toThrow(EMPTY_KEY);
  });

  test('ALLOW_EMPTY_ENV_VALUE=true is the default said out loud', () => {
    process.env.ALLOW_EMPTY_ENV_VALUE = 'true';

    expect(validate()).not.toThrow();
  });

  test('a populated value passes even with validation ON - the check is about empties only', () => {
    process.env.ALLOW_EMPTY_ENV_VALUE = 'false';
    applicationEnvironment.set(EMPTY_KEY, 'a-real-value');

    expect(validate()).not.toThrow();
  });
});
