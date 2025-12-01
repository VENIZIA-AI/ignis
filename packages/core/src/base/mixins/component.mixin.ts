import { BindingKeys, BindingNamespaces } from '@/common/bindings';
import { AnyObject, IClass, IConfigurable, TAbstractMixinTarget } from '@/common/types';
import { Binding, BindingScopes } from '@/helpers/inversion';
import { executeWithPerformanceMeasure } from '@/utilities';
import { AbstractApplication } from '../applications';
import { BaseComponent } from '../components';
import { IComponentMixin } from './types';

export const ComponentMixin = <T extends TAbstractMixinTarget<AbstractApplication>>(
  baseClass: T,
) => {
  abstract class Mixed extends baseClass implements IComponentMixin {
    component<T extends BaseComponent, O extends AnyObject = any>(
      ctor: IClass<T>,
      _args?: O,
    ): Binding<T> {
      return this.bind<T>({
        key: BindingKeys.build({
          namespace: BindingNamespaces.COMPONENT,
          key: ctor.name,
        }),
      })
        .toClass(ctor)
        .setScope(BindingScopes.SINGLETON);
    }

    async registerComponents() {
      await executeWithPerformanceMeasure({
        logger: this.logger,
        scope: this.registerComponents.name,
        description: 'Register application components',
        task: async () => {
          const bindings = this.findByTag({ tag: 'components' });
          for (const binding of bindings) {
            const instance = this.get<IConfigurable>({ key: binding.key, isOptional: false });
            if (!instance) {
              this.logger.debug(
                '[registerComponents] No binding instance | Ignore registering component | key: %s',
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
