import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

class GuardedApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'config-guard-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

/** A config assembled from the environment can lose `path.base` at run time while its type says `string` - `JSON.parse` gives the same untyped shape without a cast. */
const parseConfigs = (json: string): IApplicationConfigs => JSON.parse(json);

describe('RestApplication - configs.path.base guard', () => {
  test('a missing path.base fails at construction with the key named, not at start() inside the router', () => {
    const configs = parseConfigs('{"path":{"isStrict":false}}');

    expect(
      () => new GuardedApplication({ scope: GuardedApplication.name, config: configs }),
    ).toThrow('configs.path.base must be a string');
  });

  test('an empty base mounts at the root and is accepted', () => {
    const configs = parseConfigs('{"path":{"base":"","isStrict":false}}');

    expect(
      () => new GuardedApplication({ scope: GuardedApplication.name, config: configs }),
    ).not.toThrow();
  });
});
