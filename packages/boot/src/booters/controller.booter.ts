import { BaseArtifactBooter } from '@/base';
import { IApplication } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class ControllerBooter extends BaseArtifactBooter {
  constructor(@inject({ key: '@app/instance' }) application: IApplication) {
    super({ scope: ControllerBooter.name, application, artifactOptions: {} });
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
