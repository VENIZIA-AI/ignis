import { BindingKeys, BindingNamespaces } from '@/common/bindings';
import { IClass, IConfigurable, TMixinTarget } from '@/common/types';
import { executeWithPerformanceMeasure } from '@/utilities';
import { AbstractApplication, IApplication } from '../applications';
import { IDataSource } from '../datasources';
import { TTableSchemaWithId } from '../models';
import { IRepository } from '../repositories';
import { IRepositoryMixin } from './types';

export const RepositoryMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IRepositoryMixin {
    repository<T extends IRepository<TTableSchemaWithId>>(ctor: IClass<T>): IApplication {
      this.bind({
        key: BindingKeys.build({
          namespace: BindingNamespaces.REPOSITORY,
          key: ctor.name,
        }),
      }).toClass(ctor);
      return this;
    }

    dataSource<T extends IDataSource>(ctor: IClass<T>): IApplication {
      this.bind({
        key: BindingKeys.build({
          namespace: BindingNamespaces.DATASOURCE,
          key: ctor.name,
        }),
      }).toClass(ctor);
      return this;
    }

    async registerDataSources() {
      await executeWithPerformanceMeasure({
        logger: this.logger,
        scope: this.registerDataSources.name,
        description: 'Register application data sources',
        task: async () => {
          const bindings = this.findByTag({ tag: 'datasources' });
          for (const binding of bindings) {
            const instance = this.get<IConfigurable>({ key: binding.key, isOptional: false });
            await instance.configure();
          }
        },
      });
    }
  }

  return Mixed;
};
