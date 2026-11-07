import type { IApplicationInfo } from '@venizia/ignis-kernel';
import { WorkerApplication } from '@/applications';

/**
 * The smallest worker: no controller, no validated route, no OpenAPI. Bundled by
 * `worker-bundle-budget.test.ts`, which pins what that costs. It lives under `__tests__` so the
 * production build never sees it and `bun test` never runs it.
 */
class MinimalWorker extends WorkerApplication {
  override getAppInfo(): IApplicationInfo {
    return { name: 'minimal-worker', version: '0.0.0', description: 'No validation, no OpenAPI' };
  }

  override staticConfigure(): void {}

  override preConfigure(): void {}

  override postConfigure(): void {}

  override setupMiddlewares(): void {}
}

const application = new MinimalWorker({
  scope: 'MinimalWorker',
  config: { path: { base: '/', isStrict: false } },
});

application.listen().catch((error) => {
  console.error(error);
});
