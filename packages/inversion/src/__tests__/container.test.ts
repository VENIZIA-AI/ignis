import 'reflect-metadata';

import { beforeEach, describe, expect, test } from 'bun:test';
import { Binding } from '../modules/binding/binding';
import { BindingScopes, BindingValueTypes } from '../modules/binding/common/constants';
import type { IProvider } from '../modules/binding/common/types';
import type { IContainer } from '../modules/container/common/types';
import { Container } from '../modules/container/container';
import { inject, injectable } from '../modules/metadata/injectors';

class Greeter {
  greet(): string {
    return 'hello';
  }
}

describe('Binding - resolvers and scopes', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container({ scope: 'binding-test' });
  });

  test('toValue returns the exact value', () => {
    container.bind({ key: 'config' }).toValue({ port: 3000 });

    expect(container.get<{ port: number }>({ key: 'config' })).toEqual({ port: 3000 });
  });

  test('toClass instantiates through the container', () => {
    container.bind({ key: 'greeter' }).toClass(Greeter);

    expect(container.get<Greeter>({ key: 'greeter' }).greet()).toBe('hello');
  });

  test('toProvider with a factory function receives the container', () => {
    container.bind({ key: 'base' }).toValue(10);
    container
      .bind({ key: 'derived' })
      .toProvider(dependencyContainer => dependencyContainer.get<number>({ key: 'base' }) + 5);

    expect(container.get<number>({ key: 'derived' })).toBe(15);
  });

  test('toProvider with a class provider instantiates it and calls value()', () => {
    class PortProvider implements IProvider<number> {
      value(_dependencyContainer: IContainer): number {
        return 4242;
      }
    }
    container.bind({ key: 'port' }).toProvider(PortProvider);

    expect(container.get<number>({ key: 'port' })).toBe(4242);
  });

  test('TRANSIENT (default) yields a NEW instance per resolution', () => {
    container.bind({ key: 'greeter' }).toClass(Greeter);

    const first = container.get<Greeter>({ key: 'greeter' });
    const second = container.get<Greeter>({ key: 'greeter' });

    expect(first).not.toBe(second);
  });

  test('SINGLETON caches the first resolution', () => {
    container.bind({ key: 'greeter' }).toClass(Greeter).setScope(BindingScopes.SINGLETON);

    const first = container.get<Greeter>({ key: 'greeter' });
    const second = container.get<Greeter>({ key: 'greeter' });

    expect(first).toBe(second);
  });

  test('clear() empties singleton caches but keeps the bindings', () => {
    container.bind({ key: 'greeter' }).toClass(Greeter).setScope(BindingScopes.SINGLETON);
    const cached = container.get<Greeter>({ key: 'greeter' });

    container.clear();

    expect(container.isBound({ key: 'greeter' })).toBe(true);
    expect(container.get<Greeter>({ key: 'greeter' })).not.toBe(cached);
  });

  test('getValue without a container throws for class/provider resolvers', () => {
    const binding = new Binding<Greeter>({ key: 'orphan' }).toClass(Greeter);

    expect(() => binding.getValue()).toThrow(/Invalid context\/container/);
  });

  test('getBindingMeta returns the resolver value on type match and throws on mismatch', () => {
    const binding = new Binding<Greeter>({ key: 'meta' }).toClass(Greeter);

    expect(binding.getBindingMeta({ type: BindingValueTypes.CLASS })).toBe(Greeter);
    expect(() => binding.getBindingMeta({ type: BindingValueTypes.VALUE })).toThrow(
      /Invalid resolver type/,
    );
  });
});

describe('Binding - namespace auto-tagging', () => {
  test('a dotted key auto-tags with its namespace', () => {
    const binding = new Binding({ key: 'services.UserService' });

    expect(binding.hasTag('services')).toBe(true);
    expect(binding.getTags()).toEqual(['services']);
  });

  test('an undotted key gets no tag', () => {
    const binding = new Binding({ key: 'standalone' });

    expect(binding.getTags()).toEqual([]);
  });
});

describe('Container - storage semantics', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container({ scope: 'storage-test' });
  });

  test('a symbol key is normalized to its string form - both spellings resolve', () => {
    const key = Symbol.for('app/options');
    container.bind({ key }).toValue('configured');

    expect(container.isBound({ key })).toBe(true);
    expect(container.get<string>({ key })).toBe('configured');
    expect(container.get<string>({ key: key.toString() })).toBe('configured');
  });

  test('a { namespace, key } address resolves to the dotted binding', () => {
    container.bind({ key: 'services.UserService' }).toValue('user-service');

    expect(container.get<string>({ key: { namespace: 'services', key: 'UserService' } })).toBe(
      'user-service',
    );
  });

  test('get on a missing key throws; isOptional returns undefined', () => {
    expect(() => container.get({ key: 'missing' })).toThrow(/not bounded/);
    expect(container.get({ key: 'missing', isOptional: true })).toBeUndefined();
  });

  test('gets resolves a batch, missing entries as undefined', () => {
    container.bind({ key: 'present' }).toValue(1);

    const [present, absent] = container.gets<[number, number]>({
      bindings: [{ key: 'present' }, { key: 'absent' }],
    });

    expect(present).toBe(1);
    expect(absent).toBeUndefined();
  });

  test('unbind removes the binding; reset removes ALL bindings', () => {
    container.bind({ key: 'first' }).toValue(1);
    container.bind({ key: 'second' }).toValue(2);

    expect(container.unbind({ key: 'first' })).toBe(true);
    expect(container.isBound({ key: 'first' })).toBe(false);

    container.reset();
    expect(container.isBound({ key: 'second' })).toBe(false);
  });

  test('set() registers an externally built binding under its own key', () => {
    const binding = new Binding<number>({ key: 'external' }).toValue(7);
    container.set({ binding });

    expect(container.get<number>({ key: 'external' })).toBe(7);
  });

  test('findByTag returns namespace-tagged bindings, honouring exclude as Array and as Set', () => {
    container.bind({ key: 'services.Alpha' }).toValue('a');
    container.bind({ key: 'services.Beta' }).toValue('b');
    container.bind({ key: 'repositories.Gamma' }).toValue('c');

    const all = container.findByTag({ tag: 'services' });
    expect(all.map(binding => binding.key).sort()).toEqual(['services.Alpha', 'services.Beta']);

    const excludedByArray = container.findByTag({ tag: 'services', exclude: ['services.Alpha'] });
    expect(excludedByArray.map(binding => binding.key)).toEqual(['services.Beta']);

    const excludedBySet = container.findByTag({
      tag: 'services',
      exclude: new Set(['services.Beta']),
    });
    expect(excludedBySet.map(binding => binding.key)).toEqual(['services.Alpha']);
  });
});

describe('Container - decorator-driven injection', () => {
  test('constructor injection resolves @inject params in index order', () => {
    @injectable({})
    class ReportService {
      constructor(
        @inject({ key: 'report.prefix' }) readonly prefix: string,
        @inject({ key: 'report.suffix' }) readonly suffix: string,
      ) {}

      render(): string {
        return `${this.prefix}-body-${this.suffix}`;
      }
    }

    const container = new Container({ scope: 'injection-test' });
    container.bind({ key: 'report.prefix' }).toValue('head');
    container.bind({ key: 'report.suffix' }).toValue('tail');

    expect(container.instantiate(ReportService).render()).toBe('head-body-tail');
  });

  test('an optional constructor dependency resolves to undefined instead of throwing', () => {
    @injectable({})
    class LooseService {
      constructor(
        @inject({ key: 'not.bound', isOptional: true }) readonly missing: string | undefined,
      ) {}
    }

    const container = new Container({ scope: 'optional-test' });

    expect(container.instantiate(LooseService).missing).toBeUndefined();
  });

  test('property injection assigns decorated properties after construction', () => {
    class PropertyService {
      @inject({ key: 'injected.value' })
      injectedValue!: number;
    }

    const container = new Container({ scope: 'property-test' });
    container.bind({ key: 'injected.value' }).toValue(99);

    expect(container.instantiate(PropertyService).injectedValue).toBe(99);
  });

  test('resolve is an alias of instantiate', () => {
    const container = new Container({ scope: 'resolve-test' });

    expect(container.resolve(Greeter).greet()).toBe('hello');
  });
});
