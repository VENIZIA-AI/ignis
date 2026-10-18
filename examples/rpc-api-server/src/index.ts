import AutoArtifacts from '@venizia/ignis-boot/auto';
import { Application } from './application';
import { ViewController } from './controllers/view.controller';

const application = new Application({
  scope: 'Application',
  config: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    path: { base: '/api', isStrict: false },
    // The scanner reads `.ts` files only, so the `.tsx` controller is listed by hand.
    artifacts: [AutoArtifacts, { controllers: [ViewController] }],
  },
});

application.init();

application.start().catch((error: unknown) => {
  console.error('[main] Application start failed | Error:', error);
  process.exit(1);
});
