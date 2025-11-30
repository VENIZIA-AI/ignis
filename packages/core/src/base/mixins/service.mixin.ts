import { BindingKeys, BindingNamespaces, IClass, TMixinTarget } from '@/common';
import { AbstractApplication, IApplication } from '../applications';
import { IServiceMixin } from './types';
import { IService } from '../services';

export const ServiceMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  return class extends baseClass implements IServiceMixin {
    service<T extends IService>(ctor: IClass<T>): IApplication {
      this.bind({
        key: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: ctor.name,
        }),
      }).toClass(ctor);
      return this;
    }
  };
};
