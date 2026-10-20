import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { BindingScopes } from '../modules/binding/common/constants';
import { Container } from '../modules/container/container';
import { inject } from '../modules/metadata/injectors';
import { metadataRegistry } from '../modules/registry';

const buildContainer = () => new Container({ scope: 'container-correctness-test' });

describe("a subclass's property @inject leaves its parent and siblings alone", () => {
  class Parent {
    @inject({ key: 'deps.a' })
    a: string;
  }

  class Child extends Parent {
    @inject({ key: 'deps.b' })
    b: string;
  }

  class Sibling extends Parent {}

  test('the parent resolves without the child-only binding', () => {
    const container = buildContainer();
    container.bind({ key: 'deps.a' }).toValue('A');

    const parent = container.resolve(Parent);

    expect(parent.a).toBe('A');
    expect('b' in parent).toBe(false);
  });

  test('a sibling resolves without the child-only binding', () => {
    const container = buildContainer();
    container.bind({ key: 'deps.a' }).toValue('A');

    expect(container.resolve(Sibling).a).toBe('A');
  });

  test('the child still gets both', () => {
    const container = buildContainer();
    container.bind({ key: 'deps.a' }).toValue('A');
    container.bind({ key: 'deps.b' }).toValue('B');

    const child = container.resolve(Child);

    expect([child.a, child.b]).toEqual(['A', 'B']);
  });
});

describe('isOptional holds on the { target } form', () => {
  class Unregistered {}

  class OptionalProperty {
    @inject({ target: Unregistered, isOptional: true })
    dependency?: Unregistered;
  }

  class OptionalParameter {
    constructor(
      @inject({ target: Unregistered, isOptional: true }) readonly dependency?: Unregistered,
    ) {}
  }

  test('an unregistered optional property resolves to undefined', () => {
    expect(buildContainer().resolve(OptionalProperty).dependency).toBeUndefined();
  });

  test('an unregistered optional constructor parameter resolves to undefined', () => {
    expect(buildContainer().resolve(OptionalParameter).dependency).toBeUndefined();
  });

  test('a required one still throws, naming the class', () => {
    class Required {
      @inject({ target: Unregistered })
      dependency: Unregistered;
    }

    expect(() => buildContainer().resolve(Required)).toThrow(/Unregistered/);
  });
});

describe('metadata that carries a class and a fallback key', () => {
  test('a class nothing recorded falls back to the key', () => {
    class Unrecorded {}

    class Holder {
      constructor(readonly value: string) {}
    }
    metadataRegistry.setInjectMetadata({
      target: Holder,
      index: 0,
      metadata: { target: Unrecorded, key: 'derived.Unrecorded', index: 0, isOptional: false },
    });

    const container = buildContainer();
    container.bind({ key: 'derived.Unrecorded' }).toValue('by-hand');

    expect(container.resolve(Holder).value).toBe('by-hand');
  });

  test('a recorded class is read by its recorded key', () => {
    class Pinned {}
    metadataRegistry.setBindingKey({ target: Pinned, key: 'pinned.Pinned' });

    class Reader {
      constructor(readonly value: string) {}
    }
    metadataRegistry.setInjectMetadata({
      target: Reader,
      index: 0,
      metadata: { target: Pinned, key: 'derived.zz', index: 0, isOptional: false },
    });

    const container = buildContainer();
    container.bind({ key: 'pinned.Pinned' }).toValue('pinned');

    expect(container.resolve(Reader).value).toBe('pinned');
  });
});

describe('a dependency cycle is named, not a stack overflow', () => {
  class CycleX {
    constructor(@inject({ key: 'cycle.y' }) readonly y: unknown) {}
  }

  class CycleY {
    constructor(@inject({ key: 'cycle.x' }) readonly x: unknown) {}
  }

  test('the error names the path', () => {
    const container = buildContainer();
    container.bind({ key: 'cycle.x' }).toClass(CycleX);
    container.bind({ key: 'cycle.y' }).toClass(CycleY);

    expect(() => container.get<unknown>({ key: 'cycle.x' })).toThrow(
      /Circular dependency \| .*cycle\.[xy] -> cycle\.[xy]/,
    );
  });

  test('the container still resolves after a cycle was reported', () => {
    const container = buildContainer();
    container.bind({ key: 'cycle.x' }).toClass(CycleX);
    container.bind({ key: 'cycle.y' }).toClass(CycleY);
    container.bind({ key: 'plain' }).toValue(1);

    expect(() => container.get<unknown>({ key: 'cycle.x' })).toThrow();
    expect(container.get<number>({ key: 'plain' })).toBe(1);
  });

  test('a diamond is not a cycle', () => {
    class Leaf {}

    class Left {
      constructor(@inject({ key: 'diamond.leaf' }) readonly leaf: Leaf) {}
    }

    class Right {
      constructor(@inject({ key: 'diamond.leaf' }) readonly leaf: Leaf) {}
    }

    class Top {
      constructor(
        @inject({ key: 'diamond.left' }) readonly left: Left,
        @inject({ key: 'diamond.right' }) readonly right: Right,
      ) {}
    }

    const container = buildContainer();
    container.bind({ key: 'diamond.leaf' }).toClass(Leaf);
    container.bind({ key: 'diamond.left' }).toClass(Left);
    container.bind({ key: 'diamond.right' }).toClass(Right);

    expect(container.resolve(Top).right.leaf).toBeInstanceOf(Leaf);
  });
});

describe('the singleton cache holds any value, falsy ones included', () => {
  test('a cached null is cleared by clear()', () => {
    let session: string | null = null;
    const container = buildContainer();
    container
      .bind({ key: 'session' })
      .toProvider(() => session)
      .setScope(BindingScopes.SINGLETON);

    expect(container.get<unknown>({ key: 'session' })).toBeNull();

    session = 'signed-in';
    container.clear();

    expect(container.get<unknown>({ key: 'session' })).toBe('signed-in');
  });

  test('a singleton that answers undefined runs once', () => {
    let calls = 0;
    const container = buildContainer();
    container
      .bind({ key: 'nothing' })
      .toProvider(() => {
        calls += 1;
        return undefined;
      })
      .setScope(BindingScopes.SINGLETON);

    container.get<unknown>({ key: 'nothing' });
    container.get<unknown>({ key: 'nothing' });

    expect(calls).toBe(1);
  });

  test('a rejected async singleton stays cached until clear(), and still reports', async () => {
    let calls = 0;
    const container = buildContainer();
    container
      .bind({ key: 'config' })
      .toProvider(() => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('loaded');
      })
      .setScope(BindingScopes.SINGLETON);

    const read = () =>
      container.get<Promise<string>>({ key: 'config' }).catch((error: Error) => error.message);

    expect(await read()).toBe('offline');
    expect(await read()).toBe('offline');

    container.clear();
    expect(await read()).toBe('loaded');
  });

  test('a resolved async singleton stays cached', async () => {
    let calls = 0;
    const container = buildContainer();
    container
      .bind({ key: 'config' })
      .toProvider(() => {
        calls += 1;
        return Promise.resolve('loaded');
      })
      .setScope(BindingScopes.SINGLETON);

    await container.get<unknown>({ key: 'config' });
    await container.get<unknown>({ key: 'config' });

    expect(calls).toBe(1);
  });
});

describe('a deep resolution that throws leaves nothing behind', () => {
  test('a chain past the tracking depth that failed once resolves the next time', () => {
    let isReady = false;
    const container = buildContainer();

    for (let level = 0; level < 80; level++) {
      container
        .bind({ key: `chain.${level}` })
        .toProvider(inner => inner.get({ key: `chain.${level + 1}` }));
    }

    container.bind({ key: 'chain.80' }).toProvider(() => {
      if (!isReady) {
        throw new Error('not ready');
      }

      return 'end';
    });

    expect(() => container.get<unknown>({ key: 'chain.0' })).toThrow('not ready');

    isReady = true;
    expect(container.get<unknown>({ key: 'chain.0' })).toBe('end');
  });
});

describe('two symbols with one description are two keys', () => {
  test('each resolves its own value', () => {
    const first = Symbol('token');
    const second = Symbol('token');
    const container = buildContainer();
    container.bind({ key: first }).toValue('one');
    container.bind({ key: second }).toValue('two');

    expect([
      container.get<unknown>({ key: first }),
      container.get<unknown>({ key: second }),
    ]).toEqual(['one', 'two']);
    expect(container.isBound({ key: second })).toBe(true);
    expect(container.unbind({ key: first })).toBe(true);
    expect(container.get<unknown>({ key: second })).toBe('two');
  });

  test('reading with a symbol that was never bound records nothing', () => {
    const container = buildContainer();
    const bound = Symbol('db');

    expect(container.isBound({ key: Symbol('db') })).toBe(false);
    container.bind({ key: bound }).toValue('db');

    expect(container.get<unknown>({ key: bound })).toBe('db');
    expect(container.getBinding({ key: bound })?.key).toBe('Symbol(db)');
  });

  test('a registered symbol is the same key wherever it is created', () => {
    const container = buildContainer();
    container.bind({ key: Symbol.for('shared.token') }).toValue('shared');

    expect(container.get<unknown>({ key: Symbol.for('shared.token') })).toBe('shared');
  });
});

describe('a missing namespaced key names the key', () => {
  test('the message carries namespace.key, not [object Object]', () => {
    expect(() => buildContainer().get({ key: { namespace: 'services', key: 'Mail' } })).toThrow(
      /Binding key: services\.Mail is not bounded/,
    );
  });
});
