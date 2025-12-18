import { BaseArtifactBooter } from '@/base';
import { IApplication, IArtifactOptions } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class ControllerBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/artifact-booter/controllers', isOptional: true })
    artifactOptions?: IArtifactOptions,
  ) {
    super({ scope: ControllerBooter.name, root, artifactOptions: artifactOptions ?? {} });
  }

  // --------------------------------------------------------------------------------
  protected override getDefaultDirs(): string[] {
    return ['controllers'];
  }

  // --------------------------------------------------------------------------------
  protected override getDefaultExtensions(): string[] {
    return ['.controller.js'];
  }

  // --------------------------------------------------------------------------------
  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      this.application.bind({ key: `controllers.${cls.name}` }).toClass(cls);

      this.logger.debug(`[bind] Bound key: %s`, `controllers.${cls.name}`);
    }
  }
}
