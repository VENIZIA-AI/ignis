import { ArtifactTypes, BindingScopes, MetadataRegistry } from '@/helpers/inversion';
import { describe, expect, test } from 'bun:test';

describe('MetadataRegistry - artifact metadata', () => {
  test('records and reads back the artifact metadata of a class', () => {
    class Probe {}
    const registry = MetadataRegistry.getInstance();

    registry.setArtifactMetadata({
      target: Probe,
      metadata: { type: ArtifactTypes.SERVICE, scope: BindingScopes.SINGLETON, order: 5 },
    });

    expect(registry.getArtifactMetadata({ target: Probe })).toEqual({
      type: ArtifactTypes.SERVICE,
      scope: BindingScopes.SINGLETON,
      order: 5,
    });
  });

  test('a class without the decorator has no artifact metadata', () => {
    class Plain {}
    expect(MetadataRegistry.getInstance().getArtifactMetadata({ target: Plain })).toBeUndefined();
  });

  test('metadata is per class - a subclass does not inherit the parent artifact entry', () => {
    class Parent {}
    class Child extends Parent {}
    const registry = MetadataRegistry.getInstance();
    registry.setArtifactMetadata({ target: Parent, metadata: { type: ArtifactTypes.SERVICE } });

    expect(registry.getArtifactMetadata({ target: Child })).toBeUndefined();
  });

  test('provide metadata accumulates per class, in declaration order', () => {
    class Holder {}
    const registry = MetadataRegistry.getInstance();

    registry.addProvideMetadata({
      target: Holder,
      metadata: { methodName: 'first', key: 'a.first' },
    });
    registry.addProvideMetadata({
      target: Holder,
      metadata: { methodName: 'second', key: 'a.second' },
    });

    expect(registry.getProvideMetadata({ target: Holder }).map(m => m.key)).toEqual([
      'a.first',
      'a.second',
    ]);
    expect(registry.getProvideMetadata({ target: class Other {} })).toEqual([]);
  });

  test('ArtifactTypes validates its own vocabulary', () => {
    expect(ArtifactTypes.SCHEME_SET.size).toBe(6);
    expect(ArtifactTypes.isValid('service')).toBe(true);
    expect(ArtifactTypes.isValid('widget')).toBe(false);
  });
});
