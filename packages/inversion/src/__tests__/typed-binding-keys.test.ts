/**
 * A key is made by `BindingKeys.build<T>` and names the type of the value bound under it. The runtime half is plain: a
 * key is still a string. The type half is pinned by `@ts-expect-error` lines, which `make typecheck` fails when the
 * error they expect stops happening.
 */

import { describe, expect, test } from 'bun:test';
import { BindingKeys } from '@/modules/binding/common/constants';
import { Binding } from '@/modules/binding/binding';
import { Container } from '@/modules/container';
import { inject } from '@/modules/metadata/injectors';
import { metadataRegistry } from '@/modules/registry';
import type { TBindingKey, TBindingKeyValue, TMetadataKey } from '@/common/types';

interface IMailer {
  send(opts: { to: string }): string;
}

interface IFancyMailer extends IMailer {
  theme: string;
}

const MAILER = BindingKeys.build<IMailer>({ namespace: 'services', key: 'Mailer' });
const LABEL = BindingKeys.build<string | null>({ key: 'label' });
const ANYTHING = BindingKeys.build<unknown>({ namespace: 'services', key: 'Anything' });
const mailer: IMailer = { send: ({ to }) => `sent:${to}` };

describe('BindingKeys.build', () => {
  test('joins namespace and key, and keeps a key without a namespace exactly as written', () => {
    expect(String(MAILER)).toBe('services.Mailer');
    expect(String(LABEL)).toBe('label');
    expect(String(BindingKeys.build<unknown>({ namespace: '', key: 'bare' }))).toBe('bare');
    expect(String(BindingKeys.build<unknown>({ key: '@app/x/options' }))).toBe('@app/x/options');
  });

  test('refuses an empty key, as it always did', () => {
    expect(() => BindingKeys.build<unknown>({ namespace: 'services', key: '' })).toThrow(
      'Invalid key to build',
    );
  });

  test('a key is a plain string at run time', () => {
    expect(typeof MAILER).toBe('string');
    expect(MAILER.length).toBe('services.Mailer'.length);
  });

  test('the type argument is required: build<unknown> is the explicit form', () => {
    // @ts-expect-error build needs a type argument: build<T>
    const bare = BindingKeys.build({ key: 'bare' });

    expect(String(bare)).toBe('bare');
  });
});

/** Type-level checks: the body is compiled, never run (a raw key would bind a binding with no value). */
const compileOnly = (_check: () => void): void => undefined;

describe('only a key made by build is a key', () => {
  const container = new Container();

  test('a raw string, a template literal and a symbol are not keys', () => {
    compileOnly(() => {
      // @ts-expect-error a raw string is not a key
      container.isBound({ key: 'services.Mailer' });
      // @ts-expect-error a template literal is not a key
      container.isBound({ key: `services.${'Mailer'}` });
      // @ts-expect-error a symbol is not a key
      container.isBound({ key: Symbol('mailer') });
      // @ts-expect-error a raw string is not a key
      container.bind({ key: 'services.Mailer' });
      // @ts-expect-error a raw string is not a key
      container.get({ key: 'services.Mailer', isOptional: true });
      // @ts-expect-error a raw string is not a key
      container.getBinding({ key: 'services.Mailer' });
      // @ts-expect-error a raw string is not a key
      container.unbind({ key: 'services.Mailer' });
      // @ts-expect-error a raw string is not a key
      Binding.bind({ key: 'services.Mailer' });
      // @ts-expect-error a raw string is not a key
      inject({ key: 'services.Mailer' });
    });

    expect(container.isBound({ key: MAILER })).toBe(false);
  });

  test('the { namespace, key } object is not a key; build takes it', () => {
    compileOnly(() => {
      // @ts-expect-error the object form is gone: BindingKeys.build({ namespace, key })
      container.get({ key: { namespace: 'services', key: 'Mailer' }, isOptional: true });
      // @ts-expect-error the object form is gone
      container.getBinding({ key: { namespace: 'services', key: 'Mailer' } });
    });

    expect(
      container.getBinding({
        key: BindingKeys.build<unknown>({ namespace: 'services', key: 'Mailer' }),
      }),
    ).toBeUndefined();
  });

  test('gets takes keys only', () => {
    compileOnly(() => {
      // @ts-expect-error a raw string is not a key
      container.gets<[unknown]>({ bindings: [{ key: 'services.Mailer' }] });
    });

    expect(container.gets<[unknown]>({ bindings: [{ key: ANYTHING }] })).toEqual([undefined]);
  });

  test('a metadata key is not a binding key: it stays a string or a symbol', () => {
    const target = {};
    const key: TMetadataKey = Symbol.for('typed-binding-keys.test');

    metadataRegistry.define({ target, key, value: 1 });

    expect(metadataRegistry.get({ target, key })).toBe(1);
    expect(metadataRegistry.getKeys({ target })).toContain(key);
  });
});

describe('a JavaScript caller that passes a removed key form', () => {
  const container = new Container();

  test.each([
    ['bind', [{ key: Symbol('mailer') }]],
    ['get', [{ key: { namespace: 'services', key: 'Mailer' } }]],
    ['getBinding', [{ key: Symbol.for('mailer') }]],
    ['isBound', [{ key: Symbol('mailer') }]],
    ['unbind', [{ key: { namespace: 'services', key: 'Mailer' } }]],
  ])('%s says what replaced a symbol or the object form', (method, args) => {
    expect(() => Reflect.apply(Reflect.get(container, method), container, args)).toThrow(
      /A binding key is a string made by BindingKeys\.build/,
    );
  });
});

describe('a typed key reads its type into bind, get, getBinding and gets', () => {
  test('get returns the key type with no generic', () => {
    const container = new Container();
    container.bind({ key: MAILER }).toValue(mailer);

    const resolved = container.get({ key: MAILER });
    const sent: string = resolved.send({ to: 'a@b.c' });

    expect(sent).toBe('sent:a@b.c');
    expect(container.get({ key: MAILER, isOptional: true })?.send({ to: 'x' })).toBe('sent:x');
  });

  test('bind checks the value against the key', () => {
    const container = new Container();

    // @ts-expect-error a number is not an IMailer
    container.bind({ key: MAILER }).toValue(1);
    // @ts-expect-error a mailer without send is not an IMailer
    container.bind({ key: MAILER }).toValue({});
    container.bind({ key: MAILER }).toValue({ send: () => 'ok' });

    expect(container.get({ key: MAILER }).send({ to: 'q' })).toBe('ok');
  });

  test('getBinding returns a binding of the key type, and the binding keeps its key', () => {
    const container = new Container();
    container.bind({ key: MAILER }).toValue(mailer);

    const binding = container.getBinding({ key: MAILER });
    const value: IMailer | undefined = binding?.getValue(container);
    const key: TBindingKey<IMailer> | undefined = binding?.key;

    expect(value).toBe(mailer);
    expect(key).toBe(MAILER);
  });

  test('gets reads one type per key', () => {
    const container = new Container();
    container.bind({ key: MAILER }).toValue(mailer);
    container.bind({ key: LABEL }).toValue('hello');

    const [first, second] = container.gets<[IMailer, string | null]>({
      bindings: [{ key: MAILER }, { key: LABEL }],
    });

    expect(first?.send({ to: 'g' })).toBe('sent:g');
    expect(second).toBe('hello');
  });

  test('Binding.bind reads the key type, and the value is checked', () => {
    const binding = Binding.bind({ key: MAILER });
    binding.toValue(mailer);

    // @ts-expect-error a string is not an IMailer
    binding.toValue('x');
    expect(String(binding.key)).toBe('services.Mailer');
  });
});

describe('an explicit generic is a claim checked against the key', () => {
  test('a key built as unknown reads as unknown', () => {
    const container = new Container();
    container.bind({ key: ANYTHING }).toValue(5);

    const value: unknown = container.get({ key: ANYTHING });

    expect(value).toBe(5);
  });

  test('a claim that is a subtype or a supertype of the key type is accepted, an unrelated one is not', () => {
    const container = new Container();
    container.bind<IFancyMailer>({ key: MAILER }).toValue({ ...mailer, theme: 'dark' });

    const asFancy = container.get<IFancyMailer>({ key: MAILER });
    const asMailer = container.get<IMailer>({ key: MAILER });
    const label = container.bind<string>({ key: LABEL });

    // @ts-expect-error a number is unrelated to IMailer
    container.get<number>({ key: MAILER });
    // @ts-expect-error a number is unrelated to string | null
    container.bind<number>({ key: LABEL });

    expect(asFancy.theme).toBe('dark');
    expect(asMailer.send({ to: 'z' })).toBe('sent:z');
    expect(String(label.key)).toBe('label');
  });

  test('a typed key goes where a TBindingKey is expected', () => {
    const accepts = (key: TBindingKey) => key;
    const isBound = new Container().isBound({ key: MAILER });

    expect(accepts(MAILER)).toBe(MAILER);
    expect(isBound).toBe(false);
  });
});

describe('a key that is not one typed key', () => {
  test('a union of typed keys resolves to unknown, and still binds and gets', () => {
    const container = new Container();
    const key = Math.random() < 2 ? MAILER : LABEL;

    container.bind({ key }).toValue(mailer);

    const value: unknown = container.get({ key });
    const optional: unknown = container.get({ key, isOptional: true });
    const binding = container.getBinding({ key });

    expect(value).toBe(mailer);
    expect(optional).toBe(mailer);
    expect(String(binding?.key)).toBe('services.Mailer');
  });

  test('the unknown fallback takes no generic, so an unrelated claim is still refused', () => {
    const container = new Container();
    const key = Math.random() < 2 ? MAILER : LABEL;

    // @ts-expect-error the fallback is not generic: a union key takes no claim
    container.get<IMailer>({ key, isOptional: true });
    // @ts-expect-error an unrelated claim on a single typed key is still refused
    container.get<number>({ key: MAILER, isOptional: true });
    expect(container.isBound({ key })).toBe(false);
  });
});

describe('TBindingKeyValue', () => {
  test('names the value type of a key', () => {
    const fromTyped: TBindingKeyValue<typeof MAILER> = mailer;
    const fromUnknown: TBindingKeyValue<typeof ANYTHING> = 1;

    // @ts-expect-error a string is not an IMailer
    const wrong: TBindingKeyValue<typeof MAILER> = 'x';

    expect(fromTyped).toBe(mailer);
    expect(fromUnknown).toBe(1);
    expect(String(wrong)).toBe('x');
  });
});
