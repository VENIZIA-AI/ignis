import { BaseArtifactBooter } from '@/base/base-artifact-booter';
import { IApplication, IBootOptions } from '@/common';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class RepositoryBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) protected application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: RepositoryBooter.name, root, artifactOptions: bootOptions.repositories ?? {} });
  }
  // --------------------------------------------------------------------------------
  protected override getDefaultDirs(): string[] {
    return ['repositories'];
  }

  // --------------------------------------------------------------------------------
  protected override getDefaultExtensions(): string[] {
    return ['.repository.js'];
  }

  // --------------------------------------------------------------------------------
  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      const key = BindingKeys.build({ namespace: 'repositories', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('repositories');
      this.logger.debug('[bind] Bound key: %s', key);
    }
  }
}
