import { AbstractDataSource } from '@/base/datasources';
import { repository } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { RepositoryTypes } from '@/base/repositories';
import { BindingNamespaces } from '@/common/bindings';
import {
  ArtifactTypes,
  BindingKeys,
  Container,
  MetadataKeys,
  MetadataRegistry,
} from '@/helpers/inversion';
import type { IInjectMetadata } from '@/helpers/inversion';
import { describe, expect, test } from 'bun:test';

/** The schema is irrelevant here; `JSON.parse` returns the untyped shape the abstract signature asks for without a cast. */
class TypesProbeModel extends AbstractEntity {
  getSchema<T>(): T {
    return JSON.parse('{}');
  }
}

/** A branded datasource, so the constructor-parameter check accepts it; never configured. */
class TypesProbeDataSource extends AbstractDataSource {
  constructor() {
    super({ scope: TypesProbeDataSource.name });
  }

  async configure(): Promise<void> {}
}

const registry = MetadataRegistry.getInstance();

const dataSourceKey = BindingKeys.build({
  namespace: BindingNamespaces.DATASOURCE,
  key: TypesProbeDataSource.name,
});

const ownInjectAt = (opts: { target: Function; index: number }): IInjectMetadata | undefined => {
  const injects: IInjectMetadata[] | undefined = Reflect.getOwnMetadata(
    MetadataKeys.INJECT,
    opts.target,
  );
  return injects?.[opts.index];
};

@repository({ type: RepositoryTypes.REMOTE, dataSource: TypesProbeDataSource })
class RemoteProbeRepository {
  readonly dataSource: TypesProbeDataSource;

  constructor(dataSource: TypesProbeDataSource) {
    this.dataSource = dataSource;
  }
}

@repository()
class RemoteProbeChildRepository extends RemoteProbeRepository {}

@repository({ model: TypesProbeModel, dataSource: TypesProbeDataSource })
class DefaultTypeProbeRepository {
  constructor(readonly dataSource: TypesProbeDataSource) {}
}

@repository({
  type: RepositoryTypes.MODEL,
  model: TypesProbeModel,
  dataSource: TypesProbeDataSource,
})
class ExplicitDefaultProbeRepository {
  constructor(readonly dataSource: TypesProbeDataSource) {}
}

describe('RepositoryTypes', () => {
  test('holds exactly the two repository types and validates against them', () => {
    expect([...RepositoryTypes.SCHEME_SET]).toEqual([
      RepositoryTypes.MODEL,
      RepositoryTypes.REMOTE,
    ]);
    expect(RepositoryTypes.isValid(RepositoryTypes.MODEL)).toBe(true);
    expect(RepositoryTypes.isValid(RepositoryTypes.REMOTE)).toBe(true);
    expect(RepositoryTypes.isValid('relational')).toBe(false);
  });
});

describe(`@repository({ type: ${RepositoryTypes.REMOTE} }) - no model`, () => {
  test('decorates, registers no model binding, and records the type', () => {
    expect(registry.getRepositoryBinding({ name: RemoteProbeRepository.name })).toBeUndefined();
    expect(registry.getRepositoryMetadata({ target: RemoteProbeRepository })?.type).toBe(
      RepositoryTypes.REMOTE,
    );
    expect(registry.getArtifactMetadata({ target: RemoteProbeRepository })?.type).toBe(
      ArtifactTypes.REPOSITORY,
    );
  });

  test('injects the datasource into constructor parameter 0', () => {
    expect(ownInjectAt({ target: RemoteProbeRepository, index: 0 })?.key).toBe(dataSourceKey);

    const container = new Container();
    const dataSource = new TypesProbeDataSource();
    container.bind({ key: dataSourceKey }).toValue(dataSource);

    expect(container.resolve(RemoteProbeRepository).dataSource).toBe(dataSource);
  });

  test('a bare @repository() on a subclass inherits the model-less type and still gets no model binding', () => {
    expect(registry.getRepositoryMetadata({ target: RemoteProbeChildRepository })?.type).toBe(
      RepositoryTypes.REMOTE,
    );
    expect(
      registry.getRepositoryBinding({ name: RemoteProbeChildRepository.name }),
    ).toBeUndefined();
    expect(ownInjectAt({ target: RemoteProbeChildRepository, index: 0 })?.key).toBe(dataSourceKey);
  });

  test('a model passed from JavaScript is refused at decoration', () => {
    expect(() => {
      @repository({
        type: RepositoryTypes.REMOTE,
        // @ts-expect-error - a RepositoryTypes.REMOTE repository has no model
        model: TypesProbeModel,
        dataSource: TypesProbeDataSource,
      })
      class RemoteWithModel {}
      return RemoteWithModel;
    }).toThrow(
      `[validateRepositoryMetadata][@repository][RemoteWithModel] Invalid metadata | A '${RepositoryTypes.REMOTE}' repository takes no 'model'`,
    );
  });
});

describe(`@repository({ type: ${RepositoryTypes.MODEL} }) - the default`, () => {
  test('omitting type selects RepositoryTypes.MODEL: model binding and datasource injection as before', () => {
    expect(registry.getRepositoryBinding({ name: DefaultTypeProbeRepository.name })?.model).toBe(
      TypesProbeModel,
    );
    expect(ownInjectAt({ target: DefaultTypeProbeRepository, index: 0 })?.key).toBe(dataSourceKey);
  });

  test('an explicit RepositoryTypes.MODEL behaves the same', () => {
    expect(
      registry.getRepositoryBinding({ name: ExplicitDefaultProbeRepository.name })?.model,
    ).toBe(TypesProbeModel);
    expect(ownInjectAt({ target: ExplicitDefaultProbeRepository, index: 0 })?.key).toBe(
      dataSourceKey,
    );
  });

  test('RepositoryTypes.MODEL without a model fails at decoration', () => {
    expect(() => {
      // @ts-expect-error - a RepositoryTypes.MODEL repository requires a model
      @repository({ type: RepositoryTypes.MODEL, dataSource: TypesProbeDataSource })
      class ExplicitDefaultWithoutModel {}
      return ExplicitDefaultWithoutModel;
    }).toThrow(
      "[validateRepositoryMetadata][@repository][ExplicitDefaultWithoutModel] Invalid metadata | Missing 'model'",
    );
  });

  test('omitting both type and model fails the same way', () => {
    expect(() => {
      // @ts-expect-error - no type means RepositoryTypes.MODEL, which requires a model
      @repository({ dataSource: TypesProbeDataSource })
      class DefaultWithoutModel {}
      return DefaultWithoutModel;
    }).toThrow(
      "[validateRepositoryMetadata][@repository][DefaultWithoutModel] Invalid metadata | Missing 'model'",
    );
  });
});

describe('@repository with an unknown type', () => {
  test('is refused at decoration and names the valid types', () => {
    expect(() => {
      // @ts-expect-error - 'relational' is not a repository type
      @repository({ type: 'relational', model: TypesProbeModel, dataSource: TypesProbeDataSource })
      class UnknownType {}
      return UnknownType;
    }).toThrow(
      `[validateRepositoryMetadata][@repository][UnknownType] Invalid metadata | Unknown 'type': relational | Expected one of: ${RepositoryTypes.MODEL}, ${RepositoryTypes.REMOTE}`,
    );
  });
});
