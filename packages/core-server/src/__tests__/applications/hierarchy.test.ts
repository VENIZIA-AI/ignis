import 'reflect-metadata';

import {
  AbstractApplication,
  BaseApplication,
  RestApplication,
  ServerApplication,
} from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

const buildConfigs = (opts?: Partial<IApplicationConfigs>): IApplicationConfigs => {
  return {
    host: '127.0.0.1',
    port: 0,
    path: { base: '/', isStrict: false },
    ...opts,
  };
};

class ConcreteRestApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'rest-app', version: '0.0.0', description: 'Router-only test app' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

class ConcreteServerApplication extends ServerApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'server-app', version: '0.0.0', description: 'Server-capable test app' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

describe('application hierarchy', () => {
  test('BaseApplication -> ServerApplication -> RestApplication -> AbstractApplication', () => {
    expect(Object.getPrototypeOf(BaseApplication)).toBe(ServerApplication);
    expect(Object.getPrototypeOf(ServerApplication)).toBe(RestApplication);
    expect(Object.getPrototypeOf(RestApplication)).toBe(AbstractApplication);
  });

  test('AbstractApplication carries no router or server surface', () => {
    const surface = Object.getOwnPropertyNames(AbstractApplication.prototype);

    expect(surface).not.toContain('getServer');
    expect(surface).not.toContain('getRootRouter');
    expect(surface).not.toContain('getServerHost');
    expect(surface).not.toContain('start');
  });

  test('RestApplication exposes the router but not the server host', () => {
    const surface = Object.getOwnPropertyNames(RestApplication.prototype);

    expect(surface).toContain('getServer');
    expect(surface).toContain('getRootRouter');
    expect(surface).not.toContain('start');
    expect(surface).not.toContain('getServerHost');
  });

  test('ServerApplication adds start/stop and the server-host accessors', () => {
    const surface = Object.getOwnPropertyNames(ServerApplication.prototype);

    expect(surface).toContain('start');
    expect(surface).toContain('stop');
    expect(surface).toContain('getServerHost');
    expect(surface).toContain('getServerPort');
    expect(surface).toContain('getServerAddress');
  });

  test('asyncContext.enable defaults to false on RestApplication and true on ServerApplication', () => {
    const restApplication = new ConcreteRestApplication({
      scope: 'ConcreteRestApplication',
      config: buildConfigs(),
    });
    expect(restApplication.getProjectConfigs().asyncContext?.enable).toBe(false);

    const serverApplication = new ConcreteServerApplication({
      scope: 'ConcreteServerApplication',
      config: buildConfigs(),
    });
    expect(serverApplication.getProjectConfigs().asyncContext?.enable).toBe(true);
  });

  test('an explicit asyncContext.enable is never overridden by the layer default', () => {
    const restApplication = new ConcreteRestApplication({
      scope: 'ConcreteRestApplication',
      config: buildConfigs({ asyncContext: { enable: true } }),
    });
    expect(restApplication.getProjectConfigs().asyncContext?.enable).toBe(true);

    const serverApplication = new ConcreteServerApplication({
      scope: 'ConcreteServerApplication',
      config: buildConfigs({ asyncContext: { enable: false } }),
    });
    expect(serverApplication.getProjectConfigs().asyncContext?.enable).toBe(false);
  });
});
