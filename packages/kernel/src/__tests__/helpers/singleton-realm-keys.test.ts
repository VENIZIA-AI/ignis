import { describe, expect, test } from 'bun:test';
import {
  AuthenticationStrategyRegistry,
  AuthorizationEnforcerRegistry,
  GrantBuilder,
  MetadataRegistry,
  RelationBuilderRegistry,
  RequestContextRegistry,
} from '@/index';

/**
 * Every realm-anchored holder declares its own key, so this can assert across all of them at once.
 * Two holders sharing a key is the failure this guards: the second one silently receives the first
 * one's object, nothing throws, and the symptom surfaces somewhere unrelated.
 */
const HOLDERS = [
  { name: 'MetadataRegistry', key: MetadataRegistry.SINGLETON_REAL_KEY },
  { name: 'RelationBuilderRegistry', key: RelationBuilderRegistry.SINGLETON_REAL_KEY },
  {
    name: 'AuthenticationStrategyRegistry',
    key: AuthenticationStrategyRegistry.SINGLETON_REAL_KEY,
  },
  { name: 'AuthorizationEnforcerRegistry', key: AuthorizationEnforcerRegistry.SINGLETON_REAL_KEY },
  { name: 'GrantBuilder', key: GrantBuilder.SINGLETON_REAL_KEY },
  { name: 'RequestContextRegistry', key: RequestContextRegistry.SINGLETON_REAL_KEY },
];

describe('realm keys - one holder, one key', () => {
  test('no two holders share a key', () => {
    const byKey = new Map<string, Array<string>>();

    for (const holder of HOLDERS) {
      byKey.set(holder.key, [...(byKey.get(holder.key) ?? []), holder.name]);
    }

    const collisions = [...byKey.entries()].filter(([, names]) => names.length > 1);

    expect(collisions).toEqual([]);
    expect(byKey.size).toBe(HOLDERS.length);
  });

  test('every key is a bare slug - the namespace comes from SingletonRealm, not from the key', () => {
    for (const holder of HOLDERS) {
      expect(typeof holder.key).toBe('string');
      expect(holder.key).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
    }
  });

  test('a key never changes shape by accident - the symbol it produces is the contract', () => {
    // Two copies of this package agree only because `Symbol.for` is fed the identical string. A
    // rename here silently splits state, so the exact values are pinned rather than derived.
    expect(HOLDERS.map(holder => holder.key).sort()).toEqual([
      'authentication-strategy-registry',
      'authorization-enforcer-registry',
      'grant-builder',
      'metadata-registry',
      'relation-builder',
      'request-context-resolver',
    ]);
  });
});
