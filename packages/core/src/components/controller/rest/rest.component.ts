import type { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { ControllerTransports } from '@/base/controllers/common/constants';
import type { AbstractRestController } from '@/base/controllers/rest';
import { BindingNamespaces } from '@/common/bindings';
import { Binding, BindingValueTypes, MetadataRegistry } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import isEmpty from 'lodash/isEmpty';
import type { IRestComponentConfig } from './common/types';
import { RestBindingKeys } from './common/types';

const DEFAULT_OPTIONS: IRestComponentConfig = {};

export class RestComponent extends BaseComponent {
  constructor(private application: BaseApplication) {
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

    let bindings = this.application.findByTag({
      tag: BindingNamespaces.CONTROLLER,
      exclude: configured,
    });

    while (bindings.length > 0) {
      const binding = bindings.shift();
      if (!binding) {
        continue;
      }

      const target = binding.getBindingMeta({ type: BindingValueTypes.CLASS });
      if (!target) {
        configured.add(binding.key);
        continue;
      }

      const metadata = MetadataRegistry.getInstance().getControllerMetadata({ target });

      // Skip gRPC controllers — they are configured by GrpcComponent
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

      // Re-fetch excluding already configured — picks up dynamically added controllers
      bindings = this.application.findByTag({
        tag: BindingNamespaces.CONTROLLER,
        exclude: configured,
      });
    }
  }
}
