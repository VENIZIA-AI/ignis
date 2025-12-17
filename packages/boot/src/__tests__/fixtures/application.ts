import { IBootableApplication, IBootOptions } from '@/common/types';
import path from 'node:path';

export class TestApplication implements IBootableApplication {
  bootOptions: IBootOptions;

  constructor(opts: { bootOptions: IBootOptions }) {
    this.bootOptions = opts.bootOptions;
  }

  getProjectRoot(): string {
    return path.resolve(process.cwd(), 'dist/cjs/__tests__/fixtures');
  }
}
