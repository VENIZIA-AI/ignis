import { LoggerFactory } from '@venizia/ignis';
import { Application, beConfigs } from './application';

const logger = LoggerFactory.getLogger(['main']);

// ------------------------------------------------------------------------------------------------
const main = async () => {
  const application = new Application({
    scope: 'Application',
    config: beConfigs,
  });

  application.init();

  const applicationName = process.env.APP_ENV_APPLICATION_NAME?.toUpperCase() ?? '';
  logger.info('[runApplication] Getting ready to start up %s Application...', applicationName);

  return application
    .boot()
    .then(() => {
      application.start().catch(err => {
        logger.error(
          '[main] Application start failed | Application Name: %s | Error: %s',
          applicationName,
          err,
        );
        process.exit(1);
      });
    })
    .catch(err => {
      logger.error(
        '[main] Application boot failed | Application Name: %s | Error: %s',
        applicationName,
        err,
      );
      process.exit(1);
    });
};

export default main();
