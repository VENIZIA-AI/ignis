import { BindingNamespaces } from '@/common/bindings';
import type { Binding } from '@/helpers/inversion';
import { BindingKeys, BindingScopes } from '@/helpers/inversion';
import type { AnyObject, IConfigurable, TClass, TMixinTarget } from '@venizia/ignis-helpers';
import { executeWithPerformanceMeasure } from '@venizia/ignis-helpers';
import type { AbstractApplication } from '../applications';
import type { IDataSource } from '../datasources';
import type { IRepository } from '../repositories';
import type { IRepositoryMixin, TMixinOpts } from './types';

export const RepositoryMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IRepositoryMixin {
    repository<Base extends IRepository, Args extends AnyObject = any>(
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
