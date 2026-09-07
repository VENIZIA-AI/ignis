import { LoggerFactory } from '@venizia/ignis-helpers';
import { WinstonLogger } from '@venizia/ignis-helpers/winston';
import { Application, beConfigs } from './application';

// A compiled binary cannot load the default provider at run time; only a class reference carries it into the bundle.
LoggerFactory.use({ provider: WinstonLogger });

const logger = LoggerFactory.getLogger(['main']);

// ------------------------------------------------------------------------------------------------
const main = () => {
  const application = new Application({
    scope: 'Application',
    config: beConfigs,
  });

  const applicationName = process.env.APP_ENV_APPLICATION_NAME?.toUpperCase() ?? '';
  logger.info(
    '[runApplication] Getting ready to start up %s Application...',
    applicationName,
  );
  return application.start();
};

export default main();
