import { BindingKeys, BindingNamespaces } from '@/common/bindings';
import { TClass, IConfigurable, TMixinTarget } from '@/common/types';
import { Binding, BindingScopes } from '@/helpers/inversion';
import { executeWithPerformanceMeasure } from '@/utilities';
import { AbstractApplication } from '../applications';
import { IDataSource } from '../datasources';
import { TTableSchemaWithId } from '../models';
import { IRepository } from '../repositories';
import { IRepositoryMixin } from './types';

export const RepositoryMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IRepositoryMixin {
    repository<T extends IRepository<TTableSchemaWithId>>(ctor: TClass<T>): Binding<T> {
      return this.bind<T>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.REPOSITORY,
          key: ctor.name,
        }),
      }).toClass(ctor);
    }

    dataSource<T extends IDataSource<any>>(ctor: TClass<T>): Binding<T> {
      return this.bind<T>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.DATASOURCE,
          key: ctor.name,
        }),
      })
        .toClass(ctor)
        .setScope(BindingScopes.SINGLETON);
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
            if (!instance) {
              this.logger.debug(
                '[registerDataSources] No binding instance | Ignore registering datasource | key: %s',
                binding.key,
              );
              continue;
            }

            await instance.configure();
          }
        },
      });
    }
  }

  return Mixed;
};
