import { describe, expect, test } from 'bun:test';
import { BindingKeys, Container } from '@venizia/ignis-inversion';
import type { TInjectionGetter } from '@/common/types';

describe('TInjectionGetter - a getter over the container', () => {
  test('a getter built from Container.get is assignable, with no cast', () => {
    const container = new Container();
    const key = BindingKeys.build<string>({ key: 'services.Mailer' });
    container.bind({ key }).toValue('mailer');

    const getter: TInjectionGetter = (opts) => container.get(opts);

    expect(getter({ key })).toBe('mailer');
  });

  test('a plain string key is refused', () => {
    const getter: TInjectionGetter = (opts) => new Container().get(opts);

    expect(() => {
      // @ts-expect-error - a key is made by BindingKeys.build, not written as a string
      getter({ key: 'services.Mailer' });
    }).toThrow();
  });
});
