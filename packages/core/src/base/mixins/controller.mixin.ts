import { BindingKeys, BindingNamespaces, HTTP, TClass, TMixinTarget } from '@/common';
import { getError } from '@/helpers/error';
import { Binding, BindingValueTypes, MetadataRegistry } from '@/helpers/inversion';
import { executeWithPerformanceMeasure } from '@/utilities';
import isEmpty from 'lodash/isEmpty';
import { AbstractApplication } from '../applications';
import { BaseController } from '../controllers';
import { IControllerMixin } from './types';

export const ControllerMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IControllerMixin {
    controller<T>(ctor: TClass<T>): Binding<T> {
      return this.bind<T>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.CONTROLLER,
          key: ctor.name,
        }),
      }).toClass(ctor);
    }

    async registerControllers() {
      await executeWithPerformanceMeasure({
        logger: this.logger,
        description: 'Register application controllers',
        scope: this.registerControllers.name,
        task: async () => {
          const router = this.getRootRouter();

          const bindings = this.findByTag({ tag: 'controllers' });
          for (const binding of bindings) {
            const controllerMetadata = MetadataRegistry.getControllerMetadata({
              target: binding.getBindingMeta({ type: BindingValueTypes.CLASS }),
            });

            if (!controllerMetadata?.path || isEmpty(controllerMetadata?.path)) {
              throw getError({
                statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
                message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for controller metadata`,
              });
            }

            const instance = this.get<BaseController>({ key: binding.key, isOptional: false });
            if (!instance) {
              this.logger.debug(
                '[registerControllers] No binding instance | Ignore registering controller | key: %s',
                binding.key,
              );
              continue;
            }

            await instance.configure();

            router.route(controllerMetadata.path, instance.getRouter());
          }
        },
      });
    }
  }

  return Mixed;
};
