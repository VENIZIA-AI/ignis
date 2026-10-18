// The application class. `index.ts` is the Worker entry; the smoke test starts that entry in a Bun Worker.
import { type IApplicationInfo } from '@venizia/ignis-kernel';
import { WorkerApplication } from '@venizia/ignis-worker';
// Named imports, so the bundle carries these three fields and not the whole package.json.
import { description, name, version } from '../../package.json';

export class Application extends WorkerApplication {
  override getAppInfo(): IApplicationInfo {
    return { name, version, description };
  }

  override staticConfigure(): void {}

  override preConfigure(): void {}

  override postConfigure(): void {}

  override setupMiddlewares(): void {}
}
