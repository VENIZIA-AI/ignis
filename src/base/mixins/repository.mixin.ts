import { BindingKeys, BindingNamespaces } from '@/common/bindings';
import { IClass, TMixinTarget } from '@/common/types';
import { AbstractApplication, IApplication } from '../applications';
import { IDataSource } from '../datasources';
import { IRepository } from '../repositories';
import { IRepositoryMixin } from './types';

export const RepositoryMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IRepositoryMixin {
    dataSource<T extends IDataSource>(ctor: IClass<T>): IApplication {
      this.bind({
        key: BindingKeys.build({
          namespace: BindingNamespaces.DATASOURCE,
          key: ctor.name,
        }),
      }).toClass(ctor);
      return this;
    }

    repository<T extends IRepository>(ctor: IClass<T>): IApplication {
      this.bind({
        key: BindingKeys.build({
          namespace: BindingNamespaces.REPOSITORY,
          key: ctor.name,
        }),
      }).toClass(ctor);
      return this;
    }
  }

  return Mixed;
};
