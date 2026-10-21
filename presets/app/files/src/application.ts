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

export const application = new Application({
  scope: 'Application',
  config: {
    // Explicit config wins over the server's own env lookup, so it reads the same keys: .env.example lists them.
    host: process.env.HOST ?? process.env.APP_ENV_SERVER_HOST ?? '0.0.0.0',
    port: Number(process.env.PORT ?? process.env.APP_ENV_SERVER_PORT ?? '{{devPort}}'),
    path: { base: '/api', isStrict: false },
    artifacts: AutoArtifacts,
  },
});
