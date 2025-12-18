import { BaseArtifactBooter } from '@/base';
import { IApplication } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class ServiceBooter extends BaseArtifactBooter {
  constructor(@inject({ key: '@app/instance' }) application: IApplication) {
    super({ scope: ServiceBooter.name, application, artifactOptions: {} });
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
      this.application.bind({ key: `services.${cls.name}` }).toClass(cls);

      this.logger.debug(`[bind] Bound key: %s`, `services.${cls.name}`);
    }
  }
}
