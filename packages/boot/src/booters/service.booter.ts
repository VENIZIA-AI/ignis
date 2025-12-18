import { BaseArtifactBooter } from '@/base';

export class ServiceBooter extends BaseArtifactBooter {
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
      this.configuration.application.bind({ key: `services.${cls.name}` }).toClass(cls);

      this.logger.debug(`[bind] Bound key: %s`, `services.${cls.name}`);
    }
  }
}
