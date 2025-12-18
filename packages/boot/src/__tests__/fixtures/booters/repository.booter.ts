import { BaseArtifactBooter } from '@/base';
import { IApplication } from '@/common';
import { inject, injectable } from '@venizia/ignis-inversion';

@injectable({ tags: ['booter'] })
export class RepositoryBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) protected application: IApplication,
  ) {
    super({
      scope: RepositoryBooter.name,
      root,
      artifactOptions: {},
    });
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
