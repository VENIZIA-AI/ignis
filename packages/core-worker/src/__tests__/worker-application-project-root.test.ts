import 'reflect-metadata';

import type { IWorkerApplicationConfigs } from '@/applications/common';
import { WorkerApplication } from '@/applications/worker';
import { CoreBindings } from '@venizia/ignis-kernel';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import { ModuleUtility } from '@venizia/ignis-helpers';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

class ProjectRootWorkerApplication extends WorkerApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return {
      name: 'project-root-worker-app',
      version: '0.0.0',
      description: 'projectRoot probe',
    };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

/** The shape a host built for a non-cwd peer root takes - the base body with a hand-picked root. */
class OverridingWorkerApplication extends ProjectRootWorkerApplication {
  override getProjectRoot(): string {
    const projectRoot = join('/from', 'override');
    this.bind<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT }).toValue(projectRoot);
    return projectRoot;
  }
}

const buildConfigs = (opts?: Partial<IWorkerApplicationConfigs>): IWorkerApplicationConfigs => ({
  path: { base: '/', isStrict: false },
  ...opts,
});

describe('WorkerApplication - configs.projectRoot', () => {
  afterEach(() => {
    ModuleUtility.setProjectRoot({ projectRoot: process.cwd() });
  });

  test('absent: the project root is the process cwd, bound under APPLICATION_PROJECT_ROOT', () => {
    const application = new ProjectRootWorkerApplication({
      scope: 'default',
      config: buildConfigs(),
    });

    expect(application.getProjectRoot()).toBe(process.cwd());
    expect(application.get<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT })).toBe(
      process.cwd(),
    );
  });

  test('set: the configured path is returned and bound, no override needed', () => {
    const projectRoot = join('/srv', 'finance');
    const application = new ProjectRootWorkerApplication({
      scope: 'configured',
      config: buildConfigs({ projectRoot }),
    });

    expect(application.getProjectRoot()).toBe(projectRoot);
    expect(application.get<string>({ key: CoreBindings.APPLICATION_PROJECT_ROOT })).toBe(
      projectRoot,
    );
  });

  test('the configured root reaches ModuleUtility, so peer lookups resolve under it', () => {
    const projectRoot = join('/srv', 'finance');
    new ProjectRootWorkerApplication({
      scope: 'shared-root',
      config: buildConfigs({ projectRoot }),
    });

    expect(ModuleUtility.getProjectRoot()).toBe(projectRoot);
  });

  test('an override still wins over the config', () => {
    const application = new OverridingWorkerApplication({
      scope: 'overriding',
      config: buildConfigs({ projectRoot: join('/srv', 'ignored') }),
    });

    expect(application.getProjectRoot()).toBe(join('/from', 'override'));
  });
});
