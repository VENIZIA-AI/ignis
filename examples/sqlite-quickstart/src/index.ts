import { Application } from './application';

const application = new Application({
  scope: 'Application',
  config: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    path: { base: '/api', isStrict: false },
    discoverArtifacts: true,
  },
});

application.init();

application.start().catch((error: unknown) => {
  console.error('[main] Application start failed | Error:', error);
  process.exit(1);
});
