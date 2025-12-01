import { BindingKeys, BindingNamespaces, IClass, TMixinTarget } from '@/common';
import { Binding } from '@/helpers/inversion';
import { AbstractApplication } from '../applications';
import { IService } from '../services';
import { IServiceMixin } from './types';

export const ServiceMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  return class extends baseClass implements IServiceMixin {
    service<T extends IService>(ctor: IClass<T>): Binding<T> {
      return this.bind<T>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.SERVICE,
          key: ctor.name,
        }),
      }).toClass(ctor);
    }
  };
};
