// The application class. `src/index.ts` starts it; the smoke test boots the same class.
import {
  ApiReferenceComponent,
  BaseApplication,
  HealthCheckComponent,
  IApplicationInfo,
} from '@venizia/ignis';
import appInfo from '../package.json';

// Importing a decorated class is what registers it: `discoverArtifacts: true` binds every one.
import './datasources/sqlite.datasource';
import './repositories/note.repository';
import './repositories/comment.repository';
import './controllers/note.controller';
import './controllers/comment.controller';

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
