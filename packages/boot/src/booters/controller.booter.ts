import { BaseArtifactBooter } from '@/base/base-artifact-booter';
import { IApplication, IBootOptions } from '@/common';
import { BindingKeys, inject } from '@venizia/ignis-inversion';

export class ControllerBooter extends BaseArtifactBooter {
  constructor(
    @inject({ key: '@app/project_root' }) root: string,
    @inject({ key: '@app/instance' }) private readonly application: IApplication,
    @inject({ key: '@app/boot-options' }) bootOptions: IBootOptions,
  ) {
    super({ scope: ControllerBooter.name, root, artifactOptions: bootOptions.controllers ?? {} });
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
      const key = BindingKeys.build({ namespace: 'controllers', key: cls.name });
      this.application.bind({ key }).toClass(cls).setTags('controllers');
      this.logger.for(this.bind.name).debug('Bound key: %s', key);
    }
  }
}
