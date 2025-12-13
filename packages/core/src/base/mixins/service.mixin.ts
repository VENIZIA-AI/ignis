import { BindingNamespaces } from '@/common/bindings';
import { AnyObject, Binding, BindingKeys, TClass, TMixinTarget } from '@venizia/ignis-helpers';
import { AbstractApplication } from '../applications';
import { IService } from '../services';
import { IServiceMixin, TMixinOpts } from './types';

export const ServiceMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  return class extends baseClass implements IServiceMixin {
    service<Base extends IService, Args extends AnyObject = any>(
      ctor: TClass<Base>,
      opts?: TMixinOpts<Args>,
    ): Binding<Base> {
      return this.bind<Base>({
        key: BindingKeys.build(
          opts?.binding ?? {
            namespace: BindingNamespaces.SERVICE,
            key: ctor.name,
          },
        ),
      }).toClass(ctor);
    }
  };
};
