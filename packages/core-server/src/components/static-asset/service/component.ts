import { type BaseApplication } from '@/base/applications';
import { inject } from '@/base/metadata';
import { BaseComponent, CoreBindings } from '@venizia/ignis-kernel';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { AssetCommitToken } from '../common/commit-token';
import type { AssetPresignService } from './presign';
import type { AssetSettleService } from './settle';

/** Container keys of the services `AssetServicesComponent` binds. */
export class AssetServiceBindingKeys {
  /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. */
  static readonly ASSET_SERVICES_COMPONENT_OPTIONS = '@app/static-asset-services/options';

  /** The key of the token service registered under `name`. */
  static token(opts: { name: string }): string {
    return `@app/static-asset-services/${opts.name}/token`;
  }

  /** The key of the presign service registered under `name`. */
  static presign(opts: { name: string }): string {
    return `@app/static-asset-services/${opts.name}/presign`;
  }

  /** The key of the settle service registered under `name`. */
  static settle(opts: { name: string }): string {
    return `@app/static-asset-services/${opts.name}/settle`;
  }
}

/** The services of one name: each is built by the application with its own `build` and bound as it is. */
export interface IAssetServicesEntry {
  token?: AssetCommitToken<AnyType>;
  presign?: AssetPresignService<AnyType, AnyType>;
  settle?: AssetSettleService;
}

/** Asset services keyed by an application-chosen name. */
export type TAssetServicesComponentOptions = { [name: string]: IAssetServicesEntry };

/**
 * Binds `AssetTokenService`, `AssetPresignService` and `AssetSettleService` into the container, WITHOUT any route, so a
 * service that only needs to verify a file token or settle an upload can inject them:
 *
 * `@inject({ key: AssetServiceBindingKeys.token({ name: 'attachments' }) })`
 *
 * The services are built where their options live; this component only gives them a place in the container.
 */
export class AssetServicesComponent extends BaseComponent<TAssetServicesComponentOptions> {
  constructor(
    @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
  ) {
    super({
      scope: AssetServicesComponent.name,
      initDefault: { enable: true, container: application },
    });
  }

  override binding(): ValueOrPromise<void> {
    const entries =
      this.options ??
      this.application.get<TAssetServicesComponentOptions>({
        key: AssetServiceBindingKeys.ASSET_SERVICES_COMPONENT_OPTIONS,
      });

    for (const [name, entry] of Object.entries(entries)) {
      if (!entry.token && !entry.presign && !entry.settle) {
        throw getError({
          message: `[AssetServicesComponent] entry binds nothing | name: ${name} | give it a token, a presign or a settle service`,
        });
      }

      if (entry.token) {
        this.application
          .bind({ key: AssetServiceBindingKeys.token({ name }) })
          .toValue(entry.token);
      }

      if (entry.presign) {
        this.application
          .bind({ key: AssetServiceBindingKeys.presign({ name }) })
          .toValue(entry.presign);
      }

      if (entry.settle) {
        this.application
          .bind({ key: AssetServiceBindingKeys.settle({ name }) })
          .toValue(entry.settle);
      }

      this.application.logger.info(
        '[binding] Asset services are bound | Name: %s | token: %s | presign: %s | settle: %s',
        name,
        Boolean(entry.token),
        Boolean(entry.presign),
        Boolean(entry.settle),
      );
    }
  }
}
