import { LoggerFactory } from '@venizia/ignis';
import { Application, beConfigs } from './application';

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

// ------------------------------------------------------------------------------------------------
/* main()
  .then(() => {
    logger.info(' Application server is now initialized! Triggering STARTED event...!');
  })
  .catch(error => {
    logger.error(' Cannot start the application | Error: %s', error);
    process.exit(1);
  });

if (require.main !== module) {
  logger.error(' Invalid application module to start application!');
  process.exit(1);
} */

export default main();