import AutoArtifacts from '@venizia/ignis-boot/auto';
import { RestApplication } from '@venizia/ignis-kernel';
import { OrderEmitter } from './emitters/order.emitter';
import { OrderService } from './services/order.service';

class EmitterApplication extends RestApplication {
  getAppInfo() {
    return { name: 'emitter-app', version: '0.0.0', description: '' };
  }

  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const application = new EmitterApplication({
  scope: 'EmitterApplication',
  config: { path: { base: '/', isStrict: false } },
});
application.init();

await application.registerArtifacts(AutoArtifacts);

const first = application.get({ target: OrderEmitter });
const second = application.get({ target: OrderEmitter });
const service = application.get({ target: OrderService });

console.log(
  'RESULT ' +
    JSON.stringify({
      bound: application.findByTag({ tag: 'emitters' }).map((binding) => binding.key),
      isSingleton: first === second,
      isInjected: service.emitter === first,
    }),
);
