import { BaseArtifactBooter } from '@/base';

export class ControllerBooter extends BaseArtifactBooter {
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
      this.configuration.application.bind({ key: `controllers.${cls.name}` }).toClass(cls);

      this.logger.debug(`[bind] Bound key: %s`, `controllers.${cls.name}`);
    }
  }
}
