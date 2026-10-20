import { application } from '#src/application';

const main = async () => {
  application.init();
  await application.start();
};

main().catch((error: unknown) => {
  console.error('[main] Application start failed | Error:', error);
  process.exit(1);
});
