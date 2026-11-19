import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { BindingScopes } from '../modules/binding/common/constants';
import { Container } from '../modules/container/container';
import { inject } from '../modules/metadata/injectors';
import { metadataRegistry } from '../modules/registry';
import { BindingKeys } from '@/modules/binding/common/constants';

const buildContainer = () => new Container({ scope: 'container-correctness-test' });

describe("a subclass's property @inject leaves its parent and siblings alone", () => {
  class Parent {
    @inject({ key: BindingKeys.build<unknown>({ key: 'deps.a' }) })
    a: string;
  }

  class Child extends Parent {
    @inject({ key: BindingKeys.build<unknown>({ key: 'deps.b' }) })
    b: string;
  }

  class Sibling extends Parent {}

  test('the parent resolves without the child-only binding', () => {
    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'deps.a' }) }).toValue('A');

    const parent = container.resolve(Parent);

    expect(parent.a).toBe('A');
    expect('b' in parent).toBe(false);
  });

  test('a sibling resolves without the child-only binding', () => {
    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'deps.a' }) }).toValue('A');

    expect(container.resolve(Sibling).a).toBe('A');
  });

  test('the child still gets both', () => {
    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'deps.a' }) }).toValue('A');
    container.bind({ key: BindingKeys.build<unknown>({ key: 'deps.b' }) }).toValue('B');

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
      metadata: { target: Unrecorded, key: BindingKeys.build<unknown>({ key: 'derived.Unrecorded' }), index: 0, isOptional: false },
    });

    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'derived.Unrecorded' }) }).toValue('by-hand');

    expect(container.resolve(Holder).value).toBe('by-hand');
  });

  test('a recorded class is read by its recorded key', () => {
    class Pinned {}
    metadataRegistry.setBindingKey({ target: Pinned, key: BindingKeys.build<unknown>({ key: 'pinned.Pinned' }) });

    class Reader {
      constructor(readonly value: string) {}
    }
    metadataRegistry.setInjectMetadata({
      target: Reader,
      index: 0,
      metadata: { target: Pinned, key: BindingKeys.build<unknown>({ key: 'derived.zz' }), index: 0, isOptional: false },
    });

    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'pinned.Pinned' }) }).toValue('pinned');

    expect(container.resolve(Reader).value).toBe('pinned');
  });
});

describe('a dependency cycle is named, not a stack overflow', () => {
  class CycleX {
    constructor(@inject({ key: BindingKeys.build<unknown>({ key: 'cycle.y' }) }) readonly y: unknown) {}
  }

  class CycleY {
    constructor(@inject({ key: BindingKeys.build<unknown>({ key: 'cycle.x' }) }) readonly x: unknown) {}
  }

  test('the error names the path', () => {
    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'cycle.x' }) }).toClass(CycleX);
    container.bind({ key: BindingKeys.build<unknown>({ key: 'cycle.y' }) }).toClass(CycleY);

    expect(() => container.get({ key: BindingKeys.build<unknown>({ key: 'cycle.x' }) })).toThrow(
      /Circular dependency \| .*cycle\.[xy] -> cycle\.[xy]/,
    );
  });

  test('the container still resolves after a cycle was reported', () => {
    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'cycle.x' }) }).toClass(CycleX);
    container.bind({ key: BindingKeys.build<unknown>({ key: 'cycle.y' }) }).toClass(CycleY);
    container.bind({ key: BindingKeys.build<unknown>({ key: 'plain' }) }).toValue(1);

    expect(() => container.get({ key: BindingKeys.build<unknown>({ key: 'cycle.x' }) })).toThrow();
    expect(container.get({ key: BindingKeys.build<number>({ key: 'plain' }) })).toBe(1);
  });

  test('a diamond is not a cycle', () => {
    class Leaf {}

    class Left {
      constructor(@inject({ key: BindingKeys.build<unknown>({ key: 'diamond.leaf' }) }) readonly leaf: Leaf) {}
    }

    class Right {
      constructor(@inject({ key: BindingKeys.build<unknown>({ key: 'diamond.leaf' }) }) readonly leaf: Leaf) {}
    }

    class Top {
      constructor(
        @inject({ key: BindingKeys.build<unknown>({ key: 'diamond.left' }) }) readonly left: Left,
        @inject({ key: BindingKeys.build<unknown>({ key: 'diamond.right' }) }) readonly right: Right,
      ) {}
    }

    const container = buildContainer();
    container.bind({ key: BindingKeys.build<unknown>({ key: 'diamond.leaf' }) }).toClass(Leaf);
    container.bind({ key: BindingKeys.build<unknown>({ key: 'diamond.left' }) }).toClass(Left);
    container.bind({ key: BindingKeys.build<unknown>({ key: 'diamond.right' }) }).toClass(Right);

    expect(container.resolve(Top).right.leaf).toBeInstanceOf(Leaf);
  });
});

describe('the singleton cache holds any value, falsy ones included', () => {
  test('a cached null is cleared by clear()', () => {
    let session: string | null = null;
    const container = buildContainer();
    container
      .bind({ key: BindingKeys.build<unknown>({ key: 'session' }) })
      .toProvider(() => session)
      .setScope(BindingScopes.SINGLETON);

    expect(container.get({ key: BindingKeys.build<unknown>({ key: 'session' }) })).toBeNull();

    session = 'signed-in';
    container.clear();

    expect(container.get({ key: BindingKeys.build<unknown>({ key: 'session' }) })).toBe('signed-in');
  });

  test('a singleton that answers undefined runs once', () => {
    let calls = 0;
    const container = buildContainer();
    container
      .bind({ key: BindingKeys.build<unknown>({ key: 'nothing' }) })
      .toProvider(() => {
        calls += 1;

        return undefined;
      })
      .setScope(BindingScopes.SINGLETON);

    container.get({ key: BindingKeys.build<unknown>({ key: 'nothing' }) });
    container.get({ key: BindingKeys.build<unknown>({ key: 'nothing' }) });

    expect(calls).toBe(1);
  });

  test('a rejected async singleton stays cached until clear(), and still reports', async () => {
    let calls = 0;
    const container = buildContainer();
    container
      .bind({ key: BindingKeys.build<unknown>({ key: 'config' }) })
      .toProvider(() => {
        calls += 1;

        return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('loaded');
      })
      .setScope(BindingScopes.SINGLETON);

    const read = () =>
      container.get({ key: BindingKeys.build<Promise<string>>({ key: 'config' }) }).catch((error: Error) => error.message);

    const result = await read();
    expect(result).toBe('offline');
    const result2 = await read();
    expect(result2).toBe('offline');

    container.clear();
    const result3 = await read();
    expect(result3).toBe('loaded');
  });

  test('a resolved async singleton stays cached', async () => {
    let calls = 0;
    const container = buildContainer();
    container
      .bind({ key: BindingKeys.build<unknown>({ key: 'config' }) })
      .toProvider(() => {
        calls += 1;

        return Promise.resolve('loaded');
      })
      .setScope(BindingScopes.SINGLETON);

    await container.get({ key: BindingKeys.build<unknown>({ key: 'config' }) });
    await container.get({ key: BindingKeys.build<unknown>({ key: 'config' }) });

    expect(calls).toBe(1);
  });
});

const chainKey = (level: number) => BindingKeys.build<unknown>({ key: `chain.${level}` });

describe('a deep resolution that throws leaves nothing behind', () => {
  test('a chain past the tracking depth that failed once resolves the next time', () => {
    let isReady = false;
    const container = buildContainer();

    for (let level = 0; level < 80; level++) {
      container
        .bind({ key: chainKey(level) })
        .toProvider((inner) => inner.get({ key: chainKey(level + 1) }));
    }

    container.bind({ key: BindingKeys.build<unknown>({ key: 'chain.80' }) }).toProvider(() => {
      if (!isReady) {
        throw new Error('not ready');
      }

      return 'end';
    });

    expect(() => container.get({ key: BindingKeys.build<unknown>({ key: 'chain.0' }) })).toThrow('not ready');

    isReady = true;
    expect(container.get({ key: BindingKeys.build<unknown>({ key: 'chain.0' }) })).toBe('end');
  });
});

describe('a missing namespaced key names the key', () => {
  test('the message carries namespace.key, not [object Object]', () => {
    expect(() => buildContainer().get({ key: BindingKeys.build<unknown>({ namespace: 'services', key: 'Mail' }) })).toThrow(
      /Binding key: services\.Mail is not bounded/,
    );
  });
});
