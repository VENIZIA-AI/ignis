import { BindingKeys, BindingNamespaces, HTTP, IClass, TMixinTarget } from '@/common';
import { AbstractApplication, IApplication } from '../applications';
import { IControllerMixin } from './types';
import { BaseController } from '../controllers';
import { BindingValueTypes, MetadataRegistry } from '@/helpers/inversion';
import { ApplicationError } from '@/helpers/error';
import isEmpty from 'lodash/isEmpty';

export const ControllerMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IControllerMixin {
    controller<T>(ctor: IClass<T>): IApplication {
      this.bind<T>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.CONTROLLER,
          key: ctor.name,
        }),
      }).toClass(ctor);
      return this;
    }

    async registerControllers() {
      const logger = this.getLogger();
      logger.info('[registerControllers] START | Register Application Components...');

      const router = this.getRootRouter();

      const bindings = this.findByTag<BaseController>({ tag: 'controllers' });
      for (const binding of bindings) {
        const controllerMetadata = MetadataRegistry.getControllerMetadata({
          target: binding.getBindingMeta({ type: BindingValueTypes.CLASS }),
        });

        if (isEmpty(controllerMetadata?.path)) {
          throw ApplicationError.getError({
            statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
            message: `[registerControllers] key: '${binding.key}' | Invalid controller metadata, 'path' is required for controller metadata`,
          });
        }

        const instance = this.get<BaseController>({ key: binding.key });
        await instance.configure();

        router.route(controllerMetadata.path, instance.getRouter());
      }

      logger.info('[registerControllers] DONE | Register Application Components...');
    }
  }

  return Mixed;
};
