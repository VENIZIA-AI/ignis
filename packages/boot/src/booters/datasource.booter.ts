import { BaseArtifactBooter } from '@/base';

export class DatasourceBooter extends BaseArtifactBooter {
  // --------------------------------------------------------------------------------
  protected override getDefaultDirs(): string[] {
    return ['datasources'];
  }

  // --------------------------------------------------------------------------------
  protected override getDefaultExtensions(): string[] {
    return ['.datasource.js'];
  }

  // --------------------------------------------------------------------------------
  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      this.configuration.application.bind({ key: `datasources.${cls.name}` }).toClass(cls);

      this.logger.debug(`[bind] Bound key: %s`, `datasources.${cls.name}`);
    }
  }
}
