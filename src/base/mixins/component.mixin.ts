import { AnyObject, BindingKeys, BindingNamespaces, IClass, TMixinTarget } from '@/common';
import { BindingScopes } from '@/helpers/inversion';
import { AbstractApplication, IApplication } from '../applications';
import { BaseComponent } from '../components';
import { IComponentMixin } from './types';

export const ComponentMixin = <T extends TMixinTarget<AbstractApplication>>(baseClass: T) => {
  class Mixed extends baseClass implements IComponentMixin {
    component<T extends BaseComponent, O extends AnyObject = any>(
      ctor: IClass<T>,
      _args?: O,
    ): IApplication {
      this.bind({
        key: BindingKeys.build({
          namespace: BindingNamespaces.COMPONENT,
          key: ctor.name,
        }),
      })
        .toClass(ctor)
        .setScope(BindingScopes.SINGLETON);
      return this;
    }

    async registerComponents() {
      const logger = this.getLogger();
      logger.info('[registerComponents] START | Register Application Components...');

      const bindings = this.findByTag<BaseComponent>({ tag: 'components' });
      for (const binding of bindings) {
        const instance = this.get<BaseComponent>({ key: binding.key });
        await instance.configure();
      }

      logger.info('[registerComponents] DONE | Register Application Components...');
    }
  }

  return Mixed;
};
