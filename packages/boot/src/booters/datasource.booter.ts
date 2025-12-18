import { BaseArtifactBooter } from '@/base';
import { IApplication, IBootOptions } from '@/common';
import { inject } from '@venizia/ignis-inversion';

export class DatasourceBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: DatasourceBooter.name, root, artifactOptions: bootOptions.datasources ?? {} });
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
