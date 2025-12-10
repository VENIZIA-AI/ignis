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

export default main();