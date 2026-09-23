import { repository } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, Container, MetadataKeys, MetadataRegistry } from '@/helpers/inversion';
import type { IInjectMetadata } from '@/helpers/inversion';
import type { TClass } from '@venizia/ignis-helpers/common';
import { describe, expect, spyOn, test } from 'bun:test';
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

class CoreProbeDataSource extends ProbeDataSource {}
class DirectProbeDataSource extends ProbeDataSource {}

/** Undecorated, like a connector base: the repositories below inherit its constructor, as an application's do. */
class DataSourceHolder {
  constructor(readonly dataSource: unknown) {}
}

/** The kernel's inversion range admits 0.2.0-23, whose `setInjectMetadata` writes into the list it reads through the prototype chain. */
const writeIntoInheritedList = <Target extends object = object>(opts: {
  target: Target;
  index: number;
  metadata: IInjectMetadata;
}): void => {
  const injects: IInjectMetadata[] = Reflect.getMetadata(MetadataKeys.INJECT, opts.target) ?? [];
  injects[opts.index] = opts.metadata;
  Reflect.defineMetadata(MetadataKeys.INJECT, injects, opts.target);
};

const buildDataSourceKey = (opts: { dataSource: Function }) =>
  BindingKeys.build({ namespace: BindingNamespaces.DATASOURCE, key: opts.dataSource.name });

/** The datasource the container hands each repository: two bound values tell the two apart. */
const resolveDataSources = (opts: {
  parent: TClass<DataSourceHolder>;
  child: TClass<DataSourceHolder>;
}) => {
  const container = new Container();
  container.bind({ key: buildDataSourceKey({ dataSource: CoreProbeDataSource }) }).toValue('core');
  container
    .bind({ key: buildDataSourceKey({ dataSource: DirectProbeDataSource }) })
    .toValue('direct');

  return {
    parent: container.resolve(opts.parent).dataSource,
    child: container.resolve(opts.child).dataSource,
  };
};

describe('a @repository subclass that names its own dataSource leaves its parent on the parent dataSource', () => {
  test('the parent and the subclass each resolve their own dataSource', () => {
    @repository({ model: ProbeModel, dataSource: CoreProbeDataSource })
    class ProductProbeRepository extends DataSourceHolder {}

    @repository({ model: ProbeModel, dataSource: DirectProbeDataSource })
    class ImportStagingProbeRepository extends ProductProbeRepository {}

    expect(
      resolveDataSources({ parent: ProductProbeRepository, child: ImportStagingProbeRepository }),
    ).toEqual({ parent: 'core', child: 'direct' });
  });

  test('holds on an inversion whose setInjectMetadata writes into the inherited list', () => {
    const setInjectMetadata = spyOn(registry, 'setInjectMetadata').mockImplementation(
      writeIntoInheritedList,
    );

    try {
      @repository({ model: ProbeModel, dataSource: CoreProbeDataSource })
      class WriteThroughParentRepository extends DataSourceHolder {}

      @repository({ model: ProbeModel, dataSource: DirectProbeDataSource })
      class WriteThroughChildRepository extends WriteThroughParentRepository {}

      expect(setInjectMetadata).toHaveBeenCalledTimes(2);
      expect(
        resolveDataSources({
          parent: WriteThroughParentRepository,
          child: WriteThroughChildRepository,
        }),
      ).toEqual({ parent: 'core', child: 'direct' });
    } finally {
      setInjectMetadata.mockRestore();
    }
  });
});
