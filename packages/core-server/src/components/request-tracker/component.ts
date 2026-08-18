import { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@venizia/ignis-kernel';
import { inject } from '@/base/metadata';
import { RequestSpyMiddleware } from '@/base/middlewares';
import { BindingNamespaces, CoreBindings } from '@venizia/ignis-kernel';
import { Binding, BindingScopes } from '@venizia/ignis-kernel';
import { getError } from '@venizia/ignis-helpers/core';
import { ValueOrPromise } from '@venizia/ignis-helpers/common';
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

  /** No `requestId()` here: the id is installed by `RestApplication.registerDefaultMiddlewares()`, which runs first and uses `RequestIdGenerator` - hono's own default is `crypto.randomUUID`, which would make the server and a Worker BFF stamp different formats. */
  override binding(): ValueOrPromise<void> {
    const server = this.application.getServer();

    const mw = this.application.get<MiddlewareHandler>({
      key: RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY,
    });

    if (!mw) {
      throw getError({
        message: `[RequestTrackerComponent][binding] Invalid middleware to init request tracker | Please check again binding value | key: ${RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY}`,
      });
    }

    server.use(mw);
  }
}
