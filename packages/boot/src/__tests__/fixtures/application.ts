import { IBootableApplication, IBootOptions } from '@/common/types';
import { Container } from '@venizia/ignis-inversion';
import path from 'node:path';

export class TestApplication extends Container implements IBootableApplication {
  bootOptions: IBootOptions;

  constructor(opts: { bootOptions: IBootOptions }) {
    super({
      scope: TestApplication.name,
    });
    this.bootOptions = opts.bootOptions;
  }

  getProjectRoot(): string {
    return path.resolve(process.cwd(), 'dist/cjs/__tests__/fixtures');
  }
}
