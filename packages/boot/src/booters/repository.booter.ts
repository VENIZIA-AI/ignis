import { BaseArtifactBooter } from '@/base';
import { IApplication } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class RepositoryBooter extends BaseArtifactBooter {
  constructor(@inject({ key: '@app/instance' }) application: IApplication) {
    super({ scope: RepositoryBooter.name, application, artifactOptions: {} });
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
