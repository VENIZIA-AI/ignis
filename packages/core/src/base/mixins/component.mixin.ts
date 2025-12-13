import { BindingNamespaces } from '@/common/bindings';
import {
  AnyObject,
  Binding,
  BindingKeys,
  BindingScopes,
  executeWithPerformanceMeasure,
  IConfigurable,
  TAbstractMixinTarget,
  TClass,
} from '@venizia/ignis-helpers';
import { AbstractApplication } from '../applications';
import { BaseComponent } from '../components';
import { IComponentMixin, TMixinOpts } from './types';

export const ComponentMixin = <T extends TAbstractMixinTarget<AbstractApplication>>(
  baseClass: T,
) => {
  abstract class Mixed extends baseClass implements IComponentMixin {
    component<Base extends BaseComponent, Args extends AnyObject = any>(
      ctor: TClass<Base>,
      opts?: TMixinOpts<Args>,
    ): Binding<Base> {
      return this.bind<Base>({
        key: BindingKeys.build(
          opts?.binding ?? { namespace: BindingNamespaces.COMPONENT, key: ctor.name },
        ),
      })
        .toClass(ctor)
        .setScope(BindingScopes.SINGLETON);
    }

    registerComponents() {
      return executeWithPerformanceMeasure({
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
