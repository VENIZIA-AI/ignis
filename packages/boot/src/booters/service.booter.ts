import { BaseArtifactBooter } from '@/base';
import { IApplication, IArtifactOptions } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class ServiceBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) protected application: IApplication,
    @inject({ key: '@app/artifact-booter/services', isOptional: true })
    artifactOptions?: IArtifactOptions,
  ) {
    super({ scope: ServiceBooter.name, root, artifactOptions: artifactOptions ?? {} });
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
