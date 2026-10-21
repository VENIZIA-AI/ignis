import AutoArtifacts from '@venizia/ignis-boot/auto';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { WinstonLogger } from '@venizia/ignis-helpers/winston';
import { ControllerTransports } from '@venizia/ignis';
import { Application } from './application';

// A compiled binary cannot load the default provider at run time; only a class reference carries it into the bundle.
// It is registered before the application is built, because building it already logs.
LoggerFactory.use({ provider: WinstonLogger });

const application = new Application({
  scope: 'Application',
  config: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    path: { base: '/api', isStrict: false },
    artifacts: AutoArtifacts,
    transports: [ControllerTransports.REST, ControllerTransports.GRPC],
  },
});

const main = async () => {
  await BuildInfoStamp.register();
  application.init();
  await application.start();
};

main().catch((error: unknown) => {
  console.error('[main] Application start failed | Error:', error);
  process.exit(1);
});
