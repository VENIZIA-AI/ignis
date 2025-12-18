import { BaseArtifactBooter } from '@/base';
import { IApplication } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class DatasourceBooter extends BaseArtifactBooter {
  constructor(@inject({ key: '@app/instance' }) application: IApplication) {
    super({ scope: DatasourceBooter.name, application, artifactOptions: {} });
  }

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
      this.application.bind({ key: `datasources.${cls.name}` }).toClass(cls);

      this.logger.debug(`[bind] Bound key: %s`, `datasources.${cls.name}`);
    }
  }
}
