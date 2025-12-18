import { BaseArtifactBooter } from '@/base';
import { IApplication, IArtifactOptions } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class RepositoryBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) protected application: IApplication,
    @inject({ key: '@app/artifact-booter/repositories', isOptional: true }) artifactOptions?: IArtifactOptions,
  ) {
    super({ scope: RepositoryBooter.name, root, artifactOptions: artifactOptions ?? {} });
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
      this.application.bind({ key: `repositories.${cls.name}` }).toClass(cls);

      this.logger.debug(`[bind] Bound key: %s`, `repositories.${cls.name}`);
    }
  }
}
