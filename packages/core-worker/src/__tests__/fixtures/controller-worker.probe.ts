import { BaseRestController } from '@venizia/ignis-kernel';
import { WorkerApplication } from '@/applications';

/**
 * The same worker plus one REST controller - the validation and OpenAPI layer. Bundled by
 * `worker-bundle-budget.test.ts` as the control that proves its zod check can see zod at all.
 */
class PingController extends BaseRestController {
  constructor() {
    super({ scope: 'PingController', path: '/ping' });
  }

  override binding(): void {}
}

class ControllerWorker extends WorkerApplication {
  override getAppInfo() {
    return { name: 'controller-worker', version: '0.0.0', description: 'One controller' };
  }

  override staticConfigure(): void {}

  override preConfigure(): void {
    this.controller(PingController);
  }

  override postConfigure(): void {}

  override setupMiddlewares(): void {}
}

const application = new ControllerWorker({
  scope: 'ControllerWorker',
  config: { path: { base: '/', isStrict: false } },
});

application.listen().catch((error) => {
  console.error(error);
});
