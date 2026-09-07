import { LoggerFactory } from '@venizia/ignis-helpers';
import { WinstonLogger } from '@venizia/ignis-helpers/winston';
import { Application, beConfigs } from './application';

// A compiled binary cannot load the default provider at run time; only a class reference carries it into the bundle.
LoggerFactory.use({ provider: WinstonLogger });

const logger = LoggerFactory.getLogger(['main']);

// ------------------------------------------------------------------------------------------------
const main = async () => {
  const application = new Application({
    scope: 'Application',
    config: beConfigs,
  });

  application.init();

  const applicationName = process.env.APP_ENV_APPLICATION_NAME?.toUpperCase() ?? '';
  logger
    .for('runApplication')
    .info(' Getting ready to start up %s Application...', applicationName);

  try {
    await application.start();
  } catch (error) {
    logger.error(
      '[main] Application start failed | Application Name: %s | Error: %s',
      applicationName,
      error,
    );
    process.exit(1);
  }
};

export default main();
