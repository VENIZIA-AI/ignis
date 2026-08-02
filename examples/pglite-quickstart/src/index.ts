import {
  ApiReferenceComponent,
  BaseApplication,
  IApplicationInfo,
  ValueOrPromise,
} from '@venizia/ignis';
import { LoggerFactory } from '@venizia/ignis-helpers';
import appInfo from './../package.json';
import { NoteController } from './controllers/note.controller';
import { PGliteDataSource } from './datasources/pglite.datasource';
import { NoteRepository } from './repositories/note.repository';

const logger = LoggerFactory.getLogger(['main']);

class Application extends BaseApplication {
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return appInfo;
  }

  staticConfigure(): void {
    // No static asset surface in this example.
  }

  /** Registered by hand: the booter cannot discover `.ts` files when running from source. */
  preConfigure(): ValueOrPromise<void> {
    this.dataSource(PGliteDataSource);
    this.repository(NoteRepository);
    this.controller(NoteController);

    this.component(ApiReferenceComponent);
  }

  postConfigure(): ValueOrPromise<void> {
    // Nothing to do after binding.
  }

  setupMiddlewares(): ValueOrPromise<void> {
    // No custom middleware in this example.
  }
}

const application = new Application({
  scope: 'Application',
  config: {
    host: '0.0.0.0',
    port: 3000,
    path: { base: '/api', isStrict: false },
  },
});

application.init();

application.start().catch((error: unknown) => {
  logger.for('main').error('Application start failed | Error: %s', error);
  process.exit(1);
});
