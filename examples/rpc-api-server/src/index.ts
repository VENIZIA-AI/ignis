import AutoArtifacts from '@venizia/ignis-boot/auto';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';
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
  console.error('[main] Application start failed | Error:', error);
  process.exit(1);
});
