import 'reflect-metadata';

import { beforeEach, describe, expect, test } from 'bun:test';
import { Container } from '../modules/container/container';
import { inject } from '../modules/metadata/injectors';

/**
 * `@inject({ isOptional: true })` on a PROPERTY must yield `undefined` for a missing binding, the
 * same as on a constructor parameter. The container once read `metadata.optional` while the
 * decorator wrote `isOptional`, so every optional property injection threw - and an index signature
 * on `IPropertyMetadata` kept the typo from being a compile error.
 */
describe('optional property injection', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container({ scope: 'OptionalPropertyTest' });
  });

  test('a missing OPTIONAL property binding yields undefined instead of throwing', () => {
    class Service {
      @inject({ key: 'services.Absent', isOptional: true })
      absent?: { id: string };
    }

    const instance = container.instantiate(Service);

    expect(instance.absent).toBeUndefined();
  });

  test('a missing REQUIRED property binding still throws', () => {
    class Service {
      @inject({ key: 'services.Absent' })
      absent!: { id: string };
    }

    expect(() => container.instantiate(Service)).toThrow();
  });

  test('an optional property that IS bound receives the real value', () => {
    const value = { id: 'present' };
    container.bind({ key: 'services.Present' }).toValue(value);

    class Service {
      @inject({ key: 'services.Present', isOptional: true })
      present?: { id: string };
    }

    expect(container.instantiate(Service).present).toBe(value);
  });

  test('optional parameter injection keeps working (the path that was never broken)', () => {
    class Service {
      constructor(@inject({ key: 'services.Absent', isOptional: true }) readonly absent?: object) {}
    }

    expect(container.instantiate(Service).absent).toBeUndefined();
  });
});
