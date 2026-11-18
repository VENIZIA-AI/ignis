/**
 * A key names the type of the value bound under it (#1242). The runtime half is plain: a key is still a string. The
 * type half is pinned by `@ts-expect-error` lines, which `make typecheck` fails when the error they expect stops
 * happening, so a loosened signature cannot pass quietly.
 */

import { describe, expect, test } from 'bun:test';
import { BindingKeys } from '@/modules/binding/common/constants';
import { Binding } from '@/modules/binding/binding';
import { Container } from '@/modules/container';
import type { TBindingKey, TBindingKeyValue } from '@/common/types';

interface IMailer {
  send(opts: { to: string }): string;
}

interface IFancyMailer extends IMailer {
  theme: string;
}

const MAILER = BindingKeys.build<IMailer>({ namespace: 'services', key: 'Mailer' });
const LABEL = BindingKeys.build<string | null>({ key: 'label' });
const PLAIN = BindingKeys.build({ namespace: 'services', key: 'Plain' });
const mailer: IMailer = { send: ({ to }) => `sent:${to}` };

describe('BindingKeys.build', () => {
  test('joins namespace and key, and keeps a key without a namespace exactly as written', () => {
    expect(MAILER).toBe('services.Mailer');
    expect(LABEL).toBe('label');
    expect(BindingKeys.build({ namespace: '', key: 'bare' })).toBe('bare');
    expect(BindingKeys.build({ namespace: undefined, key: '@app/x/options' })).toBe(
      '@app/x/options',
    );
  });

  test('refuses an empty key, as it always did', () => {
    expect(() => BindingKeys.build({ namespace: 'services', key: '' })).toThrow(
      'Invalid key to build',
    );
  });

  test('a key is a plain string at run time', () => {
    expect(typeof MAILER).toBe('string');
    expect(MAILER.length).toBe('services.Mailer'.length);
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

  test('getBinding returns a binding of the key type', () => {
    const container = new Container();
    container.bind({ key: MAILER }).toValue(mailer);

    const binding = container.getBinding({ key: MAILER });
    const value: IMailer | undefined = binding?.getValue(container);

    expect(value).toBe(mailer);
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
    expect(binding.key).toBe('services.Mailer');
  });
});

describe('a plain key still works, and an explicit generic is a claim checked against the key', () => {
  test('a plain string or symbol is unknown, or the explicit generic', () => {
    const container = new Container();
    const symbolKey = Symbol('plain');
    container.bind<IMailer>({ key: 'plain.string' }).toValue(mailer);
    container.bind({ key: symbolKey }).toValue(7);

    const fromString: IMailer = container.get<IMailer>({ key: 'plain.string' });
    const unknownValue: unknown = container.get({ key: symbolKey });

    expect(fromString).toBe(mailer);
    expect(unknownValue).toBe(7);
  });

  test('a key built without a type argument is unknown', () => {
    const container = new Container();
    container.bind({ key: PLAIN }).toValue(5);

    const value: unknown = container.get({ key: PLAIN });

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
    expect(label.key).toBe('label');
  });

  test('a typed key goes where a TBindingKey is expected', () => {
    const accepts = (key: TBindingKey) => key;
    const isBound = new Container().isBound({ key: MAILER });

    expect(accepts(MAILER)).toBe(MAILER);
    expect(isBound).toBe(false);
  });
});

describe('TBindingKeyValue', () => {
  test('names the value type of a key, and unknown for a plain one', () => {
    const fromTyped: TBindingKeyValue<typeof MAILER> = mailer;
    const fromPlain: TBindingKeyValue<string> = 1;

    // @ts-expect-error a string is not an IMailer
    const wrong: TBindingKeyValue<typeof MAILER> = 'x';

    expect(fromTyped).toBe(mailer);
    expect(fromPlain).toBe(1);
    expect(String(wrong)).toBe('x');
  });
});
