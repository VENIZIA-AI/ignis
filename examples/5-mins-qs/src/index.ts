import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';
import { application } from './application';

const main = async () => {
  await BuildInfoStamp.register();
  application.init();
  await application.start();
};

main().catch((error: unknown) => {
  console.error('[main] Application start failed | Error:', error);
  process.exit(1);
});
