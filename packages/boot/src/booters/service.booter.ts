import { BaseArtifactBooter } from '@/base/base-artifact-booter';
import { IApplication, IBootOptions } from '@/common';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class ServiceBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) protected application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: ServiceBooter.name, root, artifactOptions: bootOptions.services ?? {} });
  }

  // --------------------------------------------------------------------------------
  protected override getDefaultDirs(): string[] {
    return ['services'];
  }

  // --------------------------------------------------------------------------------
  protected override getDefaultExtensions(): string[] {
    return ['.service.js'];
  }

  // --------------------------------------------------------------------------------
  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'services', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('services');
      this.logger.for(this.bind.name).debug('Bound key: %s', key);
    }
  }
}
