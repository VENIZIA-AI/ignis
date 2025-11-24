import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { inject } from '@/base/metadata';
import { RequestSpyMiddleware } from '@/base/middlewares';
import { CoreBindings } from '@/common/bindings';
import { ValueOrPromise } from '@/common/types';
import { BindingScopes } from '@/helpers';
import { requestId } from 'hono/request-id';
import { MiddlewareHandler } from 'hono/types';

export class RequestTrackerComponent extends BaseComponent {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({ scope: RequestTrackerComponent.name });

    this.bindings = {};
  }

  override binding(): ValueOrPromise<void> {
    const bindingKey = ['providers', RequestSpyMiddleware.name].join('.');
    this.application
      .bind({ key: bindingKey })
      .toProvider(RequestSpyMiddleware)
      .setScope(BindingScopes.SINGLETON);

    const server = this.application.getServer();
    server.use(requestId());

    const sw = this.application.get<MiddlewareHandler>({ key: bindingKey });
    server.use(sw);
  }
}
