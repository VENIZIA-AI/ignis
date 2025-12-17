import { BaseArtifactBooter } from '@/base';
import { IBootableApplication } from '@/common';
import { inject, injectable } from '@venizia/ignis-inversion';

@injectable({ tags: ['booter'] })
export class RepositoryBooter extends BaseArtifactBooter {
  constructor(@inject({ key: '@app/instance' }) application: IBootableApplication) {
    super({
      application,
      scope: RepositoryBooter.name,
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
      this.configuration.application.bind({ key: `repositories.${cls.name}` }).toClass(cls);
      this.logger.debug(`[bind] Bound key: %s`, `repositories.${cls.name}`);
    }
  }
}
