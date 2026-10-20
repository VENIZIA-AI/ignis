import { BindingNamespaces } from '@/common/bindings';
import { describe, expect, test } from 'bun:test';

describe('BindingNamespaces.createNamespace', () => {
  test('returns the name it was given', () => {
    expect(BindingNamespaces.createNamespace({ name: 'components' })).toBe('components');
    expect(BindingNamespaces.createNamespace({ name: 'x-tenants' })).toBe('x-tenants');
    expect(BindingNamespaces.createNamespace({ name: '@app' })).toBe('@app');
  });

  test("rejects a name holding '.' - a binding is tagged with the first segment alone, so the rest of the namespace would be lost", () => {
    expect(() => BindingNamespaces.createNamespace({ name: 'acme.services' })).toThrow(
      /Invalid namespace/,
    );
  });

  test('rejects an empty name - the key would carry no namespace and no tag', () => {
    expect(() => BindingNamespaces.createNamespace({ name: '' })).toThrow(/Invalid namespace/);
  });

  test('rejects whitespace', () => {
    expect(() => BindingNamespaces.createNamespace({ name: 'my services' })).toThrow(
      /Invalid namespace/,
    );
    expect(() => BindingNamespaces.createNamespace({ name: ' services' })).toThrow(
      /Invalid namespace/,
    );
  });

  test('rejects a missing name instead of minting the namespace "undefined"', () => {
    const configs: Record<string, string> = {};
    expect(() => BindingNamespaces.createNamespace({ name: configs.namespace })).toThrow(
      /Invalid namespace/,
    );
  });
});
