import { BindingNamespaces } from '@/common/bindings';
import {
  AnyObject,
  executeWithPerformanceMeasure,
  IConfigurable,
  TClass,
  TMixinTarget,
} from '@venizia/ignis-helpers';
import { AbstractApplication } from '../applications';
import { IDataSource } from '../datasources';
import { TTableSchemaWithId } from '../models';
import { IRepository } from '../repositories';
import { IRepositoryMixin, TMixinOpts } from './types';
import { Binding, BindingKeys, BindingScopes } from '@/helpers/inversion';

export const RepositoryMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IRepositoryMixin {
    repository<Base extends IRepository<TTableSchemaWithId>, Args extends AnyObject = any>(
      ctor: TClass<Base>,
      opts?: TMixinOpts<Args>,
    ): Binding<Base> {
      return this.bind<Base>({
        key: BindingKeys.build(
          opts?.binding ?? {
            namespace: BindingNamespaces.REPOSITORY,
            key: ctor.name,
          },
        ),
      }).toClass(ctor);
    }

    dataSource<Base extends IDataSource, Args extends AnyObject = any>(
      ctor: TClass<Base>,
      opts?: TMixinOpts<Args>,
    ): Binding<Base> {
      return this.bind<Base>({
        key: BindingKeys.build(
          opts?.binding ?? {
            namespace: BindingNamespaces.DATASOURCE,
            key: ctor.name,
          },
        ),
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
              this.logger
                .for(this.registerDataSources.name)
                .debug(
                  'No binding instance | Ignore registering datasource | key: %s',
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
