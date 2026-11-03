import AutoArtifacts from '@venizia/ignis-boot/auto';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { Application } from './application';

const application = new Application({
  scope: 'Application',
  config: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    path: { base: '/api', isStrict: false },
    artifacts: AutoArtifacts,
  },
});

const main = async () => {
  await BuildInfoStamp.register();
  application.init();
  await application.start();
};

main().catch((error: unknown) => {
  LoggerFactory.getLogger(['main']).error('Application start failed | Error: %o', error);
  process.exit(1);
});
