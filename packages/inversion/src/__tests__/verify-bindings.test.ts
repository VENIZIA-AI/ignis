import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Container } from '../modules/container/container';
import { ApplicationError } from '../modules/error';
import { inject } from '../modules/metadata/injectors';
import { metadataRegistry } from '../modules/registry/registry';
import { assertBindingsResolve, verifyBindings } from '../modules/container/verifier';

const calls = { alpha: 0, beta: 0, gamma: 0 };

class AlphaService {
  constructor() {
    calls.alpha += 1;
  }
}

class BetaService {
  constructor() {
    calls.beta += 1;
  }
}

/** Another class with the same name as `AlphaService`, bound under another key. */
const makeTwin = () => {
  class Twin {}
  Object.defineProperty(Twin, 'name', { value: AlphaService.name });
  return Twin;
};

class GammaRepository {
  constructor() {
    calls.gamma += 1;
  }
}

/** Needs a key nobody bound. */
class NeedsMissingKey {
  constructor(@inject({ key: 'services.NeverBound' }) readonly missing: unknown) {}
}

/** Needs `NeedsMissingKey`, so it fails through a dependency. */
class NeedsTheNeedy {
  constructor(@inject({ key: 'services.NeedsMissingKey' }) readonly needy: NeedsMissingKey) {}
}

/** Never registered: the shape of a service that lost its decorator. */
class Undecorated {}

class NeedsUndecorated {
  constructor(@inject({ target: Undecorated }) readonly undecorated: Undecorated) {}
}

class Throwing {
  constructor() {
    throw new Error('constructor failed on its own');
  }
}

let container: Container;

beforeEach(() => {
  calls.alpha = 0;
  calls.beta = 0;
  calls.gamma = 0;
  container = new Container({ scope: 'verify-bindings-test' });
  container.bind({ key: 'services.Alpha' }).toClass(AlphaService);
  container.bind({ key: 'services.Beta' }).toClass(BetaService);
  container.bind({ key: 'repositories.Gamma' }).toClass(GammaRepository);
  // A different namespace: never part of a run that does not name it.
  container.bind({ key: 'other.Thing' }).toValue('thing');
});

const NAMESPACES = ['services', 'repositories'];

describe('verifyBindings - what it finds', () => {
  test('K1 a service that needs an unregistered key is one failure naming the key', () => {
    container.bind({ key: 'services.NeedsMissingKey' }).toClass(NeedsMissingKey);

    const result = verifyBindings({ container, namespaces: NAMESPACES });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].key).toBe('services.NeedsMissingKey');
    expect(result.failures[0].missingKey).toBe('services.NeverBound');
    expect(result.failures[0].message).toContain('services.NeverBound is not bounded in context!');
  });

  test('K2 the thrown error names both and extra.missing is a record of arrays', () => {
    container.bind({ key: 'services.NeedsMissingKey' }).toClass(NeedsMissingKey);

    let thrown: unknown;
    try {
      assertBindingsResolve({ container, namespaces: NAMESPACES, scope: 'verifyBindings' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApplicationError);
    const error = thrown as ApplicationError;
    expect(error.message).toStartWith('[verifyBindings] 1 binding(s) cannot be resolved | ');
    expect(error.message).toContain('services.NeedsMissingKey: ');
    expect(error.message).toContain('services.NeverBound');
    expect(error.extra?.missing).toEqual({ 'services.NeverBound': ['services.NeedsMissingKey'] });
  });

  test('K3 a class injected by class that nobody registered is reported as unregisteredClass', () => {
    container.bind({ key: 'services.NeedsUndecorated' }).toClass(NeedsUndecorated);

    const result = verifyBindings({ container, namespaces: NAMESPACES });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].key).toBe('services.NeedsUndecorated');
    expect(result.failures[0].unregisteredClass).toBe('Undecorated');
    expect(result.failures[0].missingKey).toBeUndefined();
    expect(result.failures[0].message).toContain('not registered as an artifact');
  });

  test('K4 a failure through a dependency lists both, and only the enumerated ones', () => {
    container.bind({ key: 'services.NeedsMissingKey' }).toClass(NeedsMissingKey);
    container.bind({ key: 'services.NeedsTheNeedy' }).toClass(NeedsTheNeedy);

    const both = verifyBindings({ container, namespaces: NAMESPACES });
    const onlyOuter = verifyBindings({
      container,
      namespaces: NAMESPACES,
      skip: ['services.NeedsMissingKey'],
    });

    expect(both.failures.map((failure) => failure.key)).toEqual([
      'services.NeedsMissingKey',
      'services.NeedsTheNeedy',
    ]);
    expect(onlyOuter.failures.map((failure) => failure.key)).toEqual(['services.NeedsTheNeedy']);

    const error = (() => {
      try {
        assertBindingsResolve({ container, namespaces: NAMESPACES, scope: 'verifyBindings' });
      } catch (caught) {
        return caught as ApplicationError;
      }
      throw new Error('expected the assertion to throw');
    })();
    expect(error.extra?.missing).toEqual({
      'services.NeverBound': ['services.NeedsMissingKey', 'services.NeedsTheNeedy'],
    });
  });

  test('K5 only the named namespaces are resolved', () => {
    verifyBindings({ container, namespaces: ['services'] });

    expect(calls.alpha).toBe(1);
    expect(calls.beta).toBe(1);
    expect(calls.gamma).toBe(0);
  });

  test('K6 when everything resolves, nothing fails and verified lists every key in order', () => {
    const result = verifyBindings({ container, namespaces: NAMESPACES });

    expect(result.failures).toEqual([]);
    expect(result.unmatchedSkips).toEqual([]);
    expect(result.verified).toEqual(['services.Alpha', 'services.Beta', 'repositories.Gamma']);
    expect(() =>
      assertBindingsResolve({ container, namespaces: NAMESPACES, scope: 'x' }),
    ).not.toThrow();
  });

  test('K7 a constructor that throws its own error carries neither missing field, and the object is kept', () => {
    container.bind({ key: 'services.Throwing' }).toClass(Throwing);

    const result = verifyBindings({ container, namespaces: NAMESPACES });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].message).toBe('constructor failed on its own');
    expect(result.failures[0].error).toBeInstanceOf(Error);
    expect((result.failures[0].error as Error).message).toBe('constructor failed on its own');
    expect(result.failures[0].missingKey).toBeUndefined();
    expect(result.failures[0].unregisteredClass).toBeUndefined();
  });
});

describe('verifyBindings - skip', () => {
  test('K8 a class skip does not build the binding and leaves it out of verified', () => {
    const result = verifyBindings({ container, namespaces: NAMESPACES, skip: [AlphaService] });

    expect(calls.alpha).toBe(0);
    expect(result.verified).not.toContain('services.Alpha');
    expect(result.unmatchedSkips).toEqual([]);
  });

  test.each([
    ['class name', 'AlphaService'],
    ['binding key', 'services.Alpha'],
  ])('K9 a skip by %s does not build the binding either', (_form, skip) => {
    const result = verifyBindings({ container, namespaces: NAMESPACES, skip: [skip] });

    expect(calls.alpha).toBe(0);
    expect(result.verified).not.toContain('services.Alpha');
    expect(result.unmatchedSkips).toEqual([]);
  });

  test('K10 one class name that two bindings share skips both', () => {
    container.bind({ key: 'services.AlphaTwin' }).toClass(makeTwin());

    const result = verifyBindings({ container, namespaces: NAMESPACES, skip: ['AlphaService'] });

    expect(result.verified).not.toContain('services.Alpha');
    expect(result.verified).not.toContain('services.AlphaTwin');
    expect(result.unmatchedSkips).toEqual([]);
  });

  test('K11 a skip that matches nothing, or names a binding outside the namespaces, is unmatched and throws', () => {
    const result = verifyBindings({
      container,
      namespaces: NAMESPACES,
      skip: ['services.Typo', 'other.Thing'],
    });

    expect(result.unmatchedSkips).toEqual(['services.Typo', 'other.Thing']);
    expect(() =>
      assertBindingsResolve({
        container,
        namespaces: NAMESPACES,
        skip: ['services.Typo'],
        scope: 'x',
      }),
    ).toThrow(/skip matched no binding: services\.Typo/);
  });

  test('K12 a value binding is still resolved when a class skip is given, and a class skip never matches it', () => {
    container.bind({ key: 'services.Constant' }).toValue(42);

    const result = verifyBindings({ container, namespaces: NAMESPACES, skip: [BetaService] });

    expect(result.verified).toContain('services.Constant');
    expect(result.verified).not.toContain('services.Beta');
    expect(result.failures).toEqual([]);
  });

  test('K12 a subclass is not matched by its parent class', () => {
    class ChildService extends AlphaService {}
    container.bind({ key: 'services.Child' }).toClass(ChildService);

    const result = verifyBindings({ container, namespaces: NAMESPACES, skip: [AlphaService] });

    expect(result.verified).toContain('services.Child');
  });
});

describe('verifyBindings - the edges', () => {
  test('K13 a binding bound with no resolver is a failure, not a crash of the verifier', () => {
    container.bind({ key: 'services.Bare' });

    const result = verifyBindings({ container, namespaces: NAMESPACES });

    expect(result.failures.map((failure) => failure.key)).toEqual(['services.Bare']);
    expect(result.failures[0].message.length).toBeGreaterThan(0);
    expect(result.verified).toContain('services.Alpha');
  });

  test('K14 the container holds the same keys before and after', () => {
    container.bind({ key: 'services.NeedsMissingKey' }).toClass(NeedsMissingKey);
    const before = [
      ...container.findByTag({ tag: 'services' }),
      ...container.findByTag({ tag: 'repositories' }),
    ]
      .map((binding) => binding.key)
      .sort();

    verifyBindings({ container, namespaces: NAMESPACES, skip: ['services.Typo'] });

    const after = [
      ...container.findByTag({ tag: 'services' }),
      ...container.findByTag({ tag: 'repositories' }),
    ]
      .map((binding) => binding.key)
      .sort();
    expect(after).toEqual(before);
    expect(container.isBound({ key: 'services.NeverBound' })).toBe(false);
  });
});

describe('Container errors carry what is missing', () => {
  test('K15 "not bounded" carries unboundKey for a string key and an object key, message unchanged', () => {
    const stringKey = (() => {
      try {
        container.get({ key: 'services.Nope' });
      } catch (error) {
        return error as ApplicationError;
      }
      throw new Error('expected a throw');
    })();
    const objectKey = (() => {
      try {
        container.get({ key: { namespace: 'services', key: 'Nope' } });
      } catch (error) {
        return error as ApplicationError;
      }
      throw new Error('expected a throw');
    })();

    expect(stringKey.message).toBe('Binding key: services.Nope is not bounded in context!');
    expect(stringKey.extra?.unboundKey).toBe('services.Nope');
    expect(objectKey.message).toBe('Binding key: services.Nope is not bounded in context!');
    expect(objectKey.extra?.unboundKey).toBe('services.Nope');
  });

  test('K15 a class nobody registered carries unregisteredClass, message unchanged', () => {
    metadataRegistry.getBindingKey({ target: Undecorated });
    const error = (() => {
      try {
        container.instantiate(NeedsUndecorated);
      } catch (caught) {
        return caught as ApplicationError;
      }
      throw new Error('expected a throw');
    })();

    expect(error.message).toContain("names 'Undecorated', which is not registered as an artifact");
    expect(error.extra?.unregisteredClass).toBe('Undecorated');
  });
});

describe('the core stays portable', () => {
  test('K17 it imports only from inversion modules and reads no platform global', () => {
    const source = readFileSync(join(__dirname, '../modules/container/verifier.ts'), 'utf8');
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier.startsWith('.') || specifier.startsWith('@/')).toBe(true);
    }
    expect(source).not.toMatch(/\b(process|Bun|console|window|document|globalThis)\b/);
  });

  test('AK2 a spy shows the verifier calls get once per resolved binding and nothing else on the container', () => {
    const get = spyOn(container, 'get');

    verifyBindings({ container, namespaces: NAMESPACES });

    expect(get).toHaveBeenCalledTimes(3);
  });
});
