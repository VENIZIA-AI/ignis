import { ValueOrPromise } from '@/common/types';
import { AbstractPoolHelper } from './abstract';
import { IPoolOptions } from './common';

/** Concrete object pool configured by callbacks ({@link IPoolOptions}); implements the AbstractPoolHelper lifecycle hooks by delegating to `create`/`validate`/`reset`/`destroy`. */
export class BasePoolHelper<T> extends AbstractPoolHelper<T> {
  private readonly factory: IPoolOptions<T>;

  constructor(options: IPoolOptions<T>) {
    super({
      size: options.size,
      acquireTimeoutMs: options.acquireTimeoutMs,
      maxWaitingClients: options.maxWaitingClients,
      scope: options.scope ?? BasePoolHelper.name,
    });
    this.factory = options;
  }

  protected create(): ValueOrPromise<T> {
    return this.factory.create();
  }

  protected override validateResource(opts: { resource: T }): ValueOrPromise<boolean> {
    return this.factory.validate ? this.factory.validate(opts.resource) : true;
  }

  protected override resetResource(opts: { resource: T }): ValueOrPromise<void> {
    return this.factory.reset?.(opts.resource);
  }

  protected override onDestroyResource(opts: { resource: T }): ValueOrPromise<void> {
    return this.factory.destroy?.(opts.resource);
  }
}
