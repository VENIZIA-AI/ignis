import { BindingNamespaces } from '@/common/bindings';
import {
  Binding,
  BindingKeys,
  BindingScopes,
  executeWithPerformanceMeasure,
  IConfigurable,
  TClass,
  TMixinTarget,
} from '@venizia/ignis-helpers';
import { AbstractApplication } from '../applications';
import { IDataSource } from '../datasources';
import { TTableSchemaWithId } from '../models';
import { IRepository } from '../repositories';
import { IRepositoryMixin } from './types';

export const RepositoryMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IRepositoryMixin {
    repository<R extends IRepository<TTableSchemaWithId>>(ctor: TClass<R>): Binding<R> {
      return this.bind<R>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.REPOSITORY,
          key: ctor.name,
        }),
      }).toClass(ctor);
    }

    dataSource<D extends IDataSource<any>>(ctor: TClass<D>): Binding<D> {
      return this.bind<D>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.DATASOURCE,
          key: ctor.name,
        }),
      })
        .toClass(ctor)
        .setScope(BindingScopes.SINGLETON);
    }

    registerDataSources() {
      return executeWithPerformanceMeasure({
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
