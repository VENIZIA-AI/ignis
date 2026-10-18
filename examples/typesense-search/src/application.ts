// The application class. `src/index.ts` starts it; the smoke test boots the same class.
import {
  ApiReferenceComponent,
  BaseApplication,
  HealthCheckComponent,
  type IApplicationInfo,
} from '@venizia/ignis';
import appInfo from '../package.json';

export class Application extends BaseApplication {
  override getAppInfo(): IApplicationInfo {
    return appInfo;
  }

  override staticConfigure(): void {}

  override preConfigure(): void {
    this.component(ApiReferenceComponent);
    this.component(HealthCheckComponent);
  }

  override postConfigure(): void {}

  override setupMiddlewares(): void {}
}
