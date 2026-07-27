import type { BaseApplication } from '@/base/applications';
import { BaseComponent } from '@/base/components';
import { ControllerTransports } from '@/base/controllers/common/constants';
import type { AbstractGrpcController } from '@/base/controllers/grpc';
import { BindingNamespaces } from '@/common/bindings';
import { Binding, BindingValueTypes, MetadataRegistry } from '@/helpers/inversion';
import { getError, HTTP } from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';
import type { IGrpcComponentConfig } from './common/types';
import { GrpcBindingKeys } from './common/types';

const DEFAULT_OPTIONS: IGrpcComponentConfig = {};

export class GrpcComponent extends BaseComponent {
  constructor(private application: BaseApplication) {
    super({
      scope: GrpcComponent.name,
      initDefault: { enable: true, container: application },
      bindings: {
        [GrpcBindingKeys.GRPC_COMPONENT_OPTIONS]: Binding.bind<IGrpcComponentConfig>({
          key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS,
        }).toValue(DEFAULT_OPTIONS),
      },
    });
  }

  override async binding(): Promise<void> {
    const logger = this.logger.for(this.binding.name);
    const router = this.application.getRootRouter();

    const options = this.application.get<IGrpcComponentConfig>({
      key: GrpcBindingKeys.GRPC_COMPONENT_OPTIONS,
      isOptional: true,
    });

    // Dynamic binding loop with Set tracking — re-fetches after each configure to handle late-registered controllers
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

      // Skip non-gRPC controllers — they are configured by RestComponent
      if (metadata?.transport !== ControllerTransports.GRPC) {
        configured.add(binding.key);
        continue;
      }

      if (!metadata?.path || isEmpty(metadata.path)) {
        throw getError({
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
          message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for gRPC controller metadata`,
        });
      }

      const instance = this.application.get<AbstractGrpcController>({
        key: binding.key,
        isOptional: false,
      });

      if (!instance) {
        logger.debug('No binding instance | key: %s', binding.key);
        configured.add(binding.key);
        continue;
      }

      if (!instance.service) {
        logger.warn('gRPC controller has no service definition, skipping | key: %s', binding.key);
        configured.add(binding.key);
        continue;
      }

      instance.basePath = this.application.getProjectConfigs().path.base;
      instance.connectRpcModule = options?.module;
      instance.interceptors = options?.interceptors;
      await instance.configure();

      router.route(metadata.path, instance.getRouter());
      configured.add(binding.key);

      logger.info('Configured gRPC controller | key: %s | path: %s', binding.key, metadata.path);

      // Re-fetch excluding already configured — picks up dynamically added controllers
      bindings = this.application.findByTag({
        tag: BindingNamespaces.CONTROLLER,
        exclude: configured,
      });
    }
  }
}
