import { ApiReferenceComponent, BaseApplication, type IApplicationInfo } from '@venizia/ignis';
import AutoArtifacts from '@venizia/ignis-boot/auto';
import packageJson from '../package.json';

export class Application extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return packageJson;
  }

  staticConfigure() {}

  preConfigure() {
    this.component(ApiReferenceComponent);
  }

  postConfigure() {}

  setupMiddlewares() {}
}

export const application = new Application({
  scope: 'Application',
  config: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    path: { base: '/api', isStrict: false },
    artifacts: AutoArtifacts,
  },
});
