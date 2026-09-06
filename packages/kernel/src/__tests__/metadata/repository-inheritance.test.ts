import { repository } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { MetadataKeys, MetadataRegistry } from '@/helpers/inversion';
import { describe, expect, test } from 'bun:test';
import { ProbeDataSource } from '../support/artifact-fixtures';

/** The schema is irrelevant here; `JSON.parse` returns the untyped shape the abstract signature asks for without a cast. */
class ProbeModel extends AbstractEntity {
  getSchema<T>(): T {
    return JSON.parse('{}');
  }
}

@repository({ model: ProbeModel, dataSource: ProbeDataSource })
class ParentRepository {}

@repository()
class ChildRepository extends ParentRepository {}

@repository()
class GrandchildRepository extends ChildRepository {}

const registry = MetadataRegistry.getInstance();

describe('@repository() on a subclass inherits the parent metadata', () => {
  test('the subclass gets its own copy of model and dataSource, resolved and registered under its own name', () => {
    const own = Reflect.getOwnMetadata(MetadataKeys.REPOSITORY, ChildRepository);
    expect(own).toBeDefined();
    expect(registry.getRepositoryMetadata({ target: ChildRepository })?.model).toBe(ProbeModel);
    expect(registry.getRepositoryMetadata({ target: ChildRepository })?.dataSource).toBe(
      ProbeDataSource,
    );
    expect(registry.repositoryBindings.get(ChildRepository.name)?.model).toBe(ProbeModel);
    expect(registry.repositoryBindings.get(GrandchildRepository.name)?.model).toBe(ProbeModel);
  });

  test('the subclass carries artifact metadata of its own, so the generator and registerArtifact see it, without inheriting a custom binding', () => {
    @repository({
      model: ProbeModel,
      dataSource: ProbeDataSource,
      binding: { namespace: BindingNamespaces.REPOSITORY, key: 'CustomKey' },
    })
    class CustomKeyParent {}
    @repository()
    class CustomKeyChild extends CustomKeyParent {}

    expect(registry.getArtifactMetadata({ target: CustomKeyChild })?.type).toBe('repository');
    expect(registry.getArtifactMetadata({ target: CustomKeyChild })?.binding).toBeUndefined();
    expect(registry.getArtifactMetadata({ target: CustomKeyParent })?.binding?.key).toBe(
      'CustomKey',
    );
  });

  test('a bare @repository() with no decorated parent fails at decoration and names the class', () => {
    expect(() => {
      @repository()
      class Orphan {}
      return Orphan;
    }).toThrow(
      '[@repository][Orphan] No metadata given and no decorated repository above it in the prototype chain',
    );
  });
});
