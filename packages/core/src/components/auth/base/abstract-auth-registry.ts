import { BindingScopes } from '@venizia/ignis-inversion';
import { Container } from '@/helpers/inversion/container';
import { BaseHelper, getError, TClass } from '@venizia/ignis-helpers';
import isEmpty from 'lodash/isEmpty';

// Abstract Auth Registry — shared base for authentication and authorization registries

export type TRegistryDescriptor<TItem> = {
  container: Container;
  targetClass: TClass<TItem>;
};

export abstract class AbstractAuthRegistry<TItem> extends BaseHelper {
  protected descriptors: Map<string, TRegistryDescriptor<TItem>>;

  constructor(opts: { scope: string }) {
    super(opts);
    this.descriptors = new Map();
  }

  protected abstract getBindingPrefix(): string;

  getKey(opts: { name: string }): string {
    if (!opts?.name || isEmpty(opts.name)) {
      throw getError({ message: `[getKey] Invalid name | name: ${opts.name}` });
    }

    return [this.getBindingPrefix(), opts.name].join('.');
  }

  getDefaultName(): string {
    const firstName = this.descriptors.keys().next().value;
    if (!firstName) {
      throw getError({
        message: `[${this.constructor.name}] No items registered`,
      });
    }
    return firstName;
  }

  protected registerDescriptor(opts: {
    container: Container;
    target: TClass<TItem>;
    name: string;
  }): void {
    const { container, target, name } = opts;

    this.descriptors.set(name, { container, targetClass: target });
    container
      .bind({ key: this.getKey({ name }) })
      .toClass(target)
      .setScope(BindingScopes.SINGLETON);
  }

  reset(): void {
    this.descriptors.clear();
  }

  protected resolveDescriptor(opts: { name: string }): TItem {
    const { name } = opts;
    const metadata = this.descriptors.get(name);

    if (!metadata) {
      throw getError({
        message: `[${this.constructor.name}] Descriptor not found: ${name}`,
      });
    }

    const { container } = metadata;
    const instance = container.get<TItem>({
      key: this.getKey({ name }),
    });

    if (!instance) {
      throw getError({
        message: `[${this.constructor.name}] Failed to resolve: ${name}`,
      });
    }

    return instance;
  }
}
