import type { RestApplication } from '@/base/applications/rest';
import { ControllerTransports } from '@/base/controllers/common/constants';
import type { AbstractRestController } from '@/base/controllers/rest/abstract';
import { BindingNamespaces } from '@/common/bindings';
import { Binding, BindingValueTypes, MetadataRegistry } from '@/helpers/inversion';
import { BaseComponent } from '../../base';
import type { Env, Schema } from 'hono';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import isEmpty from 'lodash/isEmpty';
import type { IRestComponentConfig } from './common/types';
import { RestBindingKeys } from './common/types';

const DEFAULT_OPTIONS: IRestComponentConfig = {};

/**
 * Generic over the same Hono env/schema/base-path `RestApplication` is: a bare `RestApplication`
 * parameter (defaulting to `RestApplication<Env, {}, '/'>`) fails to typecheck when passed `this`
 * from inside a differently-instantiated generic `RestApplication` subclass - `defaultHook`'s
 * contravariance makes the defaulted instantiation incompatible with an arbitrary one. Matching the
 * caller's own instantiation here removes the mismatch instead of widening to `any`.
 */
export class RestComponent<
  AppEnv extends Env = Env,
  AppSchema extends Schema = {},
  BasePath extends string = '/',
> extends BaseComponent {
  constructor(private application: RestApplication<AppEnv, AppSchema, BasePath>) {
    super({
      scope: RestComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [RestBindingKeys.REST_COMPONENT_OPTIONS]: Binding.bind<IRestComponentConfig>({
          key: RestBindingKeys.REST_COMPONENT_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override async binding(): Promise<void> {
    const logger = this.logger.for(this.binding.name);
    const router = this.application.getRootRouter();

    const configured = new Set<string>();

    // Batch drained before re-scanning - see `RestApplication.registerDynamicBindings` for why.
    let bindings = this.application.findByTag({
      tag: BindingNamespaces.CONTROLLER,
      exclude: configured,
    });

    while (bindings.length > 0) {
      for (const binding of bindings) {
        if (configured.has(binding.key)) {
          continue;
        }

        const target = binding.getBindingMeta({ type: BindingValueTypes.CLASS });
        if (!target) {
          configured.add(binding.key);
          continue;
        }

        const metadata = MetadataRegistry.getInstance().getControllerMetadata({ target });

        // Skip gRPC controllers - they are configured by GrpcComponent
        if (metadata?.transport === ControllerTransports.GRPC) {
          configured.add(binding.key);
          continue;
        }

        if (!metadata?.path || isEmpty(metadata.path)) {
          throw getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for controller metadata`,
          });
        }

        const instance = this.application.get<AbstractRestController>({
          key: binding.key,
          isOptional: false,
        });

        if (!instance) {
          logger.debug('No binding instance | key: %s', binding.key);
          configured.add(binding.key);
          continue;
        }

        await instance.configure();
        router.route(metadata.path, instance.getRouter());
        configured.add(binding.key);

        logger.info('Configured REST controller | key: %s | path: %s', binding.key, metadata.path);
      }

      // Re-fetch excluding already configured - picks up dynamically added controllers
      bindings = this.application.findByTag({
        tag: BindingNamespaces.CONTROLLER,
        exclude: configured,
      });
    }
  }
}
