import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { RequestSpyMiddleware } from '@/base/middlewares';
import { BindingNamespaces, CoreBindings } from '@/common/bindings';
import { ValueOrPromise } from '@/common/types';
import { Binding, BindingScopes } from '@/helpers/inversion';
import { requestId } from 'hono/request-id';
import { MiddlewareHandler } from 'hono/types';

export class RequestTrackerComponent extends BaseComponent {
  static readonly REQUEST_TRACKER_MW_BINDING_KEY = [
    BindingNamespaces.MIDDLEWARE,
    RequestSpyMiddleware.name,
  ].join('.');

  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: RequestTrackerComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY]: Binding.bind({
          key: RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY,
        })
          .toProvider(RequestSpyMiddleware)
          .setScope(BindingScopes.SINGLETON),
      },
    });
  }

  override binding(): ValueOrPromise<void> {
    const server = this.application.getServer();
    server.use(requestId());

    const sw = this.application.get<MiddlewareHandler>({
      key: RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY,
    });
    server.use(sw);
  }
}
