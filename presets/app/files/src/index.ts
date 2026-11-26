import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { application } from '#src/application';

const main = async () => {
  await BuildInfoStamp.register();
  application.init();
  await application.start();
};

main().catch((error: unknown) => {
  LoggerFactory.getLogger(['main']).error('Application start failed | Error: %s', error);
  process.exit(1);
});
