import { LoggerFactory } from '@venizia/ignis-helpers';
import { Application, beConfigs } from './application';

const logger = LoggerFactory.getLogger(['main']);

// ------------------------------------------------------------------------------------------------
const main = async () => {
  const application = new Application({
    scope: 'Application',
    config: beConfigs,
  });

  application.init();

  const applicationName = process.env.APP_ENV_APPLICATION_NAME?.toUpperCase() ?? 'WEBSOCKET-TEST';
  logger.for('runApplication').info('Getting ready to start up %s Application...', applicationName);

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
