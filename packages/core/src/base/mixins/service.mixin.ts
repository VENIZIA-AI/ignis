import { BindingNamespaces } from '@/common/bindings';
import type { Binding } from '@/helpers/inversion';
import { BindingKeys } from '@/helpers/inversion';
import type { AnyObject, TClass, TMixinTarget } from '@venizia/ignis-helpers';
import type { AbstractApplication } from '../applications';
import type { IService } from '../services';
import type { IServiceMixin, TMixinOpts } from './types';

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
