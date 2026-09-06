import 'reflect-metadata';

import { ServerApplication } from '@/base/applications';
import type { IServerApplicationConfigs } from '@/base/applications';
import { CoreBindings } from '@venizia/ignis-kernel';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

class ProjectRootApplication extends ServerApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'project-root-app', version: '0.0.0', description: 'projectRoot probe' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

/** The shape 16 BANA packages carried before the option existed: the base body with `__dirname`. */
class OverridingApplication extends ProjectRootApplication {
  override getProjectRoot(): string {
    const projectRoot = join('/from', 'override');
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
  }
}

const buildConfigs = (opts?: Partial<IServerApplicationConfigs>): IServerApplicationConfigs => ({
  path: { base: '/', isStrict: false },
  ...opts,
});

describe('ServerApplication - configs.projectRoot', () => {
  test('absent: the project root is the process cwd, bound under APPLICATION_PROJECT_ROOT', () => {
    const application = new ProjectRootApplication({ scope: 'default', config: buildConfigs() });

    expect(application.getProjectRoot()).toBe(process.cwd());
    expect(application.get<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT })).toBe(
      process.cwd(),
    );
  });

  test('set: the configured path is returned and bound, no override needed', () => {
    const projectRoot = join('/srv', 'finance');
    const application = new ProjectRootApplication({
      scope: 'configured',
      config: buildConfigs({ projectRoot }),
    });

    expect(application.getProjectRoot()).toBe(projectRoot);
    expect(application.get<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT })).toBe(
      projectRoot,
    );
  });

  test('an override still wins over the config', () => {
    const application = new OverridingApplication({
      scope: 'overriding',
      config: buildConfigs({ projectRoot: join('/srv', 'ignored') }),
    });

    expect(application.getProjectRoot()).toBe(join('/from', 'override'));
  });
});
