import { BaseArtifactBooter } from '@/base/base-artifact-booter';
import { IApplication, IBootOptions } from '@/common';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

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
      const key = BindingKeys.build({ namespace: 'datasources', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('datasources').setScope('singleton');
      this.logger.for(this.bind.name).debug('Bound key: %s', key);
    }
  }
}
