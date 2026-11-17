import { Injection } from '@/base/controllers/factory/injection';
import type { TInjected, TInjectMap } from '@/base/controllers/factory/injection';
import { Container, MetadataRegistry } from '@/helpers/inversion';
import { describe, expect, test } from 'bun:test';

class InjectionClock {
  now() {
    return 42;
  }
}

class InjectionRepo {
  name = 'repo';
}

class InjectionMailer {
  send() {
    return 'sent';
  }
}

/** A stand-in for what a factory's `build` generates: the repository at parameter 0, the declared classes after it. */
const build = <Inject extends TInjectMap>(opts: { inject: Inject }) => {
  const generated = class {
    injected: TInjected<Inject>;

    constructor(
      public repository: InjectionRepo,
      ...instances: unknown[]
    ) {
      this.injected = Injection.collect({ scope: 'build', inject: opts.inject, instances });
    }
  };

  MetadataRegistry.getInstance().setInjectMetadata({
    target: generated,
    index: 0,
    metadata: { key: 'repositories.InjectionRepo', index: 0, isOptional: false },
  });
  Injection.register({ target: generated, inject: opts.inject, offset: 1 });

  return generated;
};

const bindAll = (container: Container) => {
  container.bind({ key: 'repositories.InjectionRepo' }).toClass(InjectionRepo);
  container.bind({ key: 'services.InjectionClock' }).toClass(InjectionClock);
  container.bind({ key: 'services.InjectionMailer' }).toClass(InjectionMailer);
  MetadataRegistry.getInstance().setBindingKey({
    target: InjectionClock,
    key: 'services.InjectionClock',
  });
  MetadataRegistry.getInstance().setBindingKey({
    target: InjectionMailer,
    key: 'services.InjectionMailer',
  });
};

describe('Injection through the real container', () => {
  test('a subclass with no constructor gets typed instances by name', () => {
    const container = new Container();
    bindAll(container);

    class Sub extends build({ inject: { clock: InjectionClock, mailer: InjectionMailer } }) {}

    const instance = container.resolve(Sub);

    expect(instance.repository).toBeInstanceOf(InjectionRepo);
    expect(instance.injected.clock.now()).toBe(42);
    expect(instance.injected.mailer.send()).toBe('sent');
  });

  test('a class that is not registered fails when the controller is built, not at request time', () => {
    const container = new Container();
    container.bind({ key: 'repositories.InjectionRepo' }).toClass(InjectionRepo);

    class Unregistered {}
    class Sub extends build({ inject: { missing: Unregistered } }) {}

    expect(() => container.resolve(Sub)).toThrow(/not registered as an artifact/);
  });

  test('a test double bound under the key is what the callback receives', () => {
    const container = new Container();
    bindAll(container);
    container.bind({ key: 'services.InjectionClock' }).toValue({ now: () => 7 });

    class Sub extends build({ inject: { clock: InjectionClock } }) {}

    expect(container.resolve(Sub).injected.clock.now()).toBe(7);
  });

  test('a subclass constructor that drops the arguments is refused with a 500 and a clear message', () => {
    const container = new Container();
    bindAll(container);

    const Base = build({ inject: { clock: InjectionClock } });

    class Sub extends Base {
      constructor(repository: InjectionRepo) {
        super(repository);
      }
    }

    MetadataRegistry.getInstance().setInjectMetadata({
      target: Sub,
      index: 0,
      metadata: { key: 'repositories.InjectionRepo', index: 0, isOptional: false },
    });

    expect(() => container.resolve(Sub)).toThrow(/declared dependency was not injected/);

    try {
      container.resolve(Sub);
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(500);
    }
  });
});
