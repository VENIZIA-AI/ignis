import { BaseArtifactBooter } from '@/base';
import { injectable } from '@venizia/ignis-inversion';

@injectable({ tags: ['booter'] })
export class RepositoryBooter extends BaseArtifactBooter {
  // --------------------------------------------------------------------------------
  protected override getDefaultDirs(): string[] {
    return ['repositories'];
  }

  // --------------------------------------------------------------------------------
  protected override getDefaultExtensions(): string[] {
    return ['.repository.js'];
  }

  // --------------------------------------------------------------------------------
  protected override async bind(): Promise<void> {
    for (const cls of this.loadedClasses) {
      this.configuration.application.bind({ key: `repository.${cls.name}` }).toValue(cls);

      if (this.debug) {
        console.log(`[DEBUG][${this.name}][bind] Bound repository class: ${cls.name}`);
      }
    }
  }
}
