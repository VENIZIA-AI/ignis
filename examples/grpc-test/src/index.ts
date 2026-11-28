import { Application } from '@/application';
import { ApplicationConfigs } from '@/common/application-configs';
import { EnvKeys } from '@/common/env-keys';
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { BuildInfoStamp } from '@venizia/ignis-boot/build-info';
import { AppEnvs, LoggerFactory, ParseUtility } from '@venizia/ignis-helpers';

// `AppEnvs` holds the `APP_ENV_` variables only.
const port = ParseUtility.toNumber({ input: AppEnvs.get(EnvKeys.APP_ENV_SERVER_PORT) }) ?? 3000;

const application = new Application({
  scope: 'Application',
  // Loopback by default. Set APP_ENV_SERVER_HOST to serve other machines, behind a TLS proxy.
  config: {
    ...ApplicationConfigs.build({ port }),
    host: AppEnvs.get(EnvKeys.APP_ENV_SERVER_HOST, { defaultValue: '127.0.0.1' }),
    artifacts: AutoArtifacts,
  },
});

const main = async () => {
  await BuildInfoStamp.register();
  application.init();
  await application.start();

  // SIGTERM and SIGINT: end the followed streams, drain the native port, close both servers and the database.
  application.installShutdownSignals({ timeoutMs: 15_000 });
};

main().catch((error: unknown) => {
  LoggerFactory.getLogger(['main']).error('Application start failed | Error: %o', error);
  process.exit(1);
});
