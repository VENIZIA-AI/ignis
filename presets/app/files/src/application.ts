import { ApiReferenceComponent, BaseApplication, type IApplicationInfo } from '@venizia/ignis';
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { WinstonLogger } from '@venizia/ignis-helpers/winston';
import packageJson from '../package.json';

export class Application extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: packageJson.name,
      version: packageJson.version,
      description: 'The {{app}} backend of {{project}}',
    };
  }

  staticConfigure() {}

  preConfigure() {
    this.component(ApiReferenceComponent);
  }

  postConfigure() {}

  setupMiddlewares() {}
}

// A compiled binary cannot load the default provider at run time; only a class reference carries it into the bundle.
// It is registered before the application below is built, because building it already logs.
LoggerFactory.use({ provider: WinstonLogger });

// The server resolves its own address from HOST and PORT, then these two (.env.example lists
// them). Without a value the app listens on every interface, on its dev port.
// `AppEnvs` copied process.env when it was imported, so it does not see these
// defaults.
process.env.APP_ENV_SERVER_HOST ||= '0.0.0.0';
process.env.APP_ENV_SERVER_PORT ||= '{{devPort}}';

export const application = new Application({
  scope: 'Application',
  config: {
    path: { base: '/api', isStrict: false },
    artifacts: AutoArtifacts,
  },
});
