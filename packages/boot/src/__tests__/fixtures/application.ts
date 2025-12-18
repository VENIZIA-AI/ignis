import { IBootOptions } from '@/common/types';
import { Container } from '@venizia/ignis-inversion';
import path from 'node:path';
import { RepositoryBooter } from './booters/repository.booter';

export class TestApplication extends Container {
  bootOptions: IBootOptions;

  constructor(opts: { bootOptions: IBootOptions }) {
    super({
      scope: TestApplication.name,
    });
    this.bootOptions = opts.bootOptions;

    this.bind({ key: '@app/instance' }).toValue(this);
    this.bind({ key: '@app/project_root' }).toValue(__dirname);

    this.bindBooters();
  }

  // --------------------------------------------------------------------------------
  private bindBooters() {
    this.bind({ key: 'booter.RepositoryBooter' }).toClass(RepositoryBooter).setTags('booter');
  }

  // --------------------------------------------------------------------------------
  getProjectRoot(): string {
    return path.resolve(process.cwd(), 'dist/cjs/__tests__/fixtures');
  }
}
