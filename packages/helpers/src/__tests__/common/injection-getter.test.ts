import { describe, expect, test } from 'bun:test';
import { BindingKeys } from '@venizia/ignis-inversion';
import type { IContainer } from '@venizia/ignis-inversion';
import type { TInjectionGetter } from '@/common/types';

describe('TInjectionGetter - a getter over the container', () => {
  test('a getter built from Container.get is assignable, with no cast', () => {
    const container = {
      get: <T>(opts: { key: string }) => `value of ${opts.key}` as T,
    } as unknown as IContainer;

    const getter: TInjectionGetter = (opts) => container.get(opts);
    const key = BindingKeys.build<string>({ key: 'services.Mailer' });

    expect(getter<string>({ key })).toBe('value of services.Mailer');
  });

  test('a plain string key is refused', () => {
    const getter: TInjectionGetter = () => undefined as never;

    // @ts-expect-error - a key is made by BindingKeys.build, not written as a string
    getter({ key: 'services.Mailer' });
  });
});
