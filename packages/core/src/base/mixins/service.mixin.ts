import { BindingNamespaces } from '@/common/bindings';
import { Binding, BindingKeys, TClass, TMixinTarget } from '@vez/ignis-helpers';
import { AbstractApplication } from '../applications';
import { IService } from '../services';
import { IServiceMixin } from './types';

export const ServiceMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  return class extends baseClass implements IServiceMixin {
    service<S extends IService>(ctor: TClass<S>): Binding<S> {
      return this.bind<S>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: ctor.name,
        }),
      }).toClass(ctor);
    }
  };
};
