import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { AbstractDataSource } from '@/base/datasources';
import { datasource, inject, repository, service } from '@/base/metadata';
import { ArtifactBindingKeys } from '@/base/metadata/artifact-keys';
import { AbstractEntity } from '@/base/models';
import { RepositoryTypes } from '@/base/repositories';
import { BindingNamespaces } from '@/common/bindings';
import { MetadataRegistry } from '@/helpers/inversion';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

/* eslint-disable @typescript-eslint/naming-convention -- the classes are named the way a minified build names them */

/**
 * A minified build renames classes, and two chunks give two classes the same short name. Every
 * class below is named the way such a build names it.
 */

class IdentityApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'identity-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

const buildApplication = () => {
  const application = new IdentityApplication({
    scope: IdentityApplication.name,
    config: { path: { base: '/', isStrict: false } } as IApplicationConfigs,
  });
  application.init();
  return application;
};

/** Two different classes that both end up named `zz`. */
const twoClassesNamedZz = () => {
  const first = (() => {
    @service()
    class zz {
      readonly from = 'first';
    }
    return zz;
  })();

  const second = (() => {
    @service()
    class zz {
      readonly from = 'second';
    }
    return zz;
  })();

  return { first, second };
};

describe('two classes that derive one binding key fail registration, naming the key', () => {
  test('a collision throws instead of binding the second over the first', async () => {
    const { first, second } = twoClassesNamedZz();

    const failure = await buildApplication()
      .registerArtifacts({ services: [first, second] })
      .then(
        () => 'registered',
        (error: Error) => error.message,
      );

    expect(failure).toMatch(/Two classes derive the binding key 'services\.zz'/);
  });

  test('a pinned binding on one of them is a choice, and registers', async () => {
    const first = (() => {
      @service()
      class zz {}
      return zz;
    })();
    const second = (() => {
      @service({ binding: { namespace: BindingNamespaces.SERVICE, key: 'Pinned' } })
      class zz {}
      return zz;
    })();

    const application = buildApplication();
    await application.registerArtifacts({ services: [first, second] });

    expect(application.isBound({ key: 'services.zz' })).toBe(true);
    expect(application.isBound({ key: 'services.Pinned' })).toBe(true);
  });

  test('one class listed twice is not a collision', async () => {
    const { first } = twoClassesNamedZz();
    const application = buildApplication();

    await application.registerArtifacts([{ services: [first] }, { services: [first] }]);

    expect(application.isBound({ key: 'services.zz' })).toBe(true);
  });

  test('the same class twice is not a collision, two classes are', () => {
    const { first, second } = twoClassesNamedZz();
    const entry = (target: Function) => ({ target, namespace: BindingNamespaces.SERVICE });

    expect(
      ArtifactBindingKeys.findDerivedCollisions({ entries: [entry(first), entry(first)] }),
    ).toEqual([]);
    expect(
      ArtifactBindingKeys.findDerivedCollisions({ entries: [entry(first), entry(second)] }),
    ).toEqual(['services.zz']);
  });

  test('allowDerivedKeyCollision turns the failure into a warning, the last class winning', async () => {
    const { first, second } = twoClassesNamedZz();
    const application = new IdentityApplication({
      scope: IdentityApplication.name,
      config: {
        path: { base: '/', isStrict: false },
        bootChecks: { allowDerivedKeyCollision: true },
      } as IApplicationConfigs,
    });
    application.init();

    await application.registerArtifacts({ services: [first, second] });

    expect(application.get<{ from: string }>({ key: 'services.zz' }).from).toBe('second');
  });

  test('ArtifactBindingKeys tells a derived key from a pinned one', () => {
    class Plain {}

    expect(
      ArtifactBindingKeys.resolve({ target: Plain, namespace: BindingNamespaces.SERVICE }),
    ).toEqual({ key: 'services.Plain', isDerived: true });
    expect(
      ArtifactBindingKeys.resolve({
        target: Plain,
        namespace: BindingNamespaces.SERVICE,
        binding: { namespace: 'services', key: 'Named' },
      }),
    ).toEqual({ key: 'services.Named', isDerived: false });
  });
});

class IdentityModel extends AbstractEntity {
  getSchema<T>(): T {
    return JSON.parse('{}');
  }
}

describe('@repository injects its datasource by the class, so a pinned key survives a renamed class', () => {
  test('a pinned datasource named zz is injected with no @inject on the repository', async () => {
    @datasource({ binding: { namespace: BindingNamespaces.DATASOURCE, key: 'ApiDataSource' } })
    class zz extends AbstractDataSource {
      constructor() {
        super({ scope: 'zz' });
      }
      async configure(): Promise<void> {}
    }

    @repository({ type: RepositoryTypes.REMOTE, dataSource: zz })
    class yy {
      entity = new IdentityModel({ name: 'remote' });

      constructor(readonly dataSource: zz) {}

      getEntity() {
        return this.entity;
      }
    }

    const application = buildApplication();
    application.dataSource(zz);
    application.repository(yy);

    const resolved = application.get<yy>({ key: 'repositories.yy' });

    expect(application.isBound({ key: 'datasources.ApiDataSource' })).toBe(true);
    expect(resolved.dataSource).toBeInstanceOf(zz);
  });

  test('an undecorated datasource registered by hand under a pinned key is found by its class', async () => {
    class zz extends AbstractDataSource {
      constructor() {
        super({ scope: 'zz' });
      }
      async configure(): Promise<void> {}
    }

    @repository({ type: RepositoryTypes.REMOTE, dataSource: zz })
    class ww {
      entity = new IdentityModel({ name: 'remote' });

      constructor(readonly dataSource: zz) {}

      getEntity() {
        return this.entity;
      }
    }

    const application = buildApplication();
    application.dataSource(zz, {
      binding: { namespace: BindingNamespaces.DATASOURCE, key: 'ApiDataSource' },
    });
    application.repository(ww);

    expect(application.get<ww>({ key: 'repositories.ww' }).dataSource).toBeInstanceOf(zz);
  });

  test('an undecorated datasource bound raw under its derived key still resolves', () => {
    class RawDataSource extends AbstractDataSource {
      constructor() {
        super({ scope: 'RawDataSource' });
      }
      async configure(): Promise<void> {}
    }

    @repository({ type: RepositoryTypes.REMOTE, dataSource: RawDataSource })
    class RawRepository {
      entity = new IdentityModel({ name: 'remote' });

      constructor(readonly dataSource: RawDataSource) {}

      getEntity() {
        return this.entity;
      }
    }

    const application = buildApplication();
    application.bind({ key: 'datasources.RawDataSource' }).toClass(RawDataSource);
    application.repository(RawRepository);

    expect(
      application.get<RawRepository>({ key: 'repositories.RawRepository' }).dataSource,
    ).toBeInstanceOf(RawDataSource);
  });

  test('an explicit @inject at index 0 is not second-guessed by the parameter type', () => {
    class ProbeDataSource extends AbstractDataSource {
      constructor() {
        super({ scope: 'ProbeDataSource' });
      }
      async configure(): Promise<void> {}
    }

    interface IDataSourceShape {
      configure(): Promise<void>;
    }

    expect(() => {
      @repository({ type: RepositoryTypes.REMOTE, dataSource: ProbeDataSource })
      class InterfaceTypedRepository {
        constructor(@inject({ target: ProbeDataSource }) readonly dataSource: IDataSourceShape) {}
      }
      return InterfaceTypedRepository;
    }).not.toThrow();
  });

  test('a datasource bound under its own namespace is accepted by its brand', () => {
    @datasource({ binding: { namespace: 'remotes', key: 'catalog' } })
    class CatalogDataSource extends AbstractDataSource {
      constructor() {
        super({ scope: 'catalog' });
      }
      async configure(): Promise<void> {}
    }

    expect(() => {
      @repository({ type: RepositoryTypes.REMOTE, dataSource: CatalogDataSource })
      class CatalogRepository {
        constructor(
          @inject({ target: CatalogDataSource }) readonly dataSource: CatalogDataSource,
        ) {}
      }
      return CatalogRepository;
    }).not.toThrow();
  });
});

describe('the registry keeps repositories and datasources apart by class, not by name', () => {
  const registry = MetadataRegistry.getInstance();

  const twoDataSourcesNamedXx = () => {
    const first = (() => {
      class xx extends AbstractDataSource {
        async configure(): Promise<void> {}
      }
      return xx;
    })();
    const second = (() => {
      class xx extends AbstractDataSource {
        async configure(): Promise<void> {}
      }
      return xx;
    })();
    return { first, second };
  };

  test('two same-named repositories each read their own model', () => {
    const { first: dataSource } = twoDataSourcesNamedXx();
    const modelA = (() => class ModelA extends IdentityModel {})();
    const modelB = (() => class ModelB extends IdentityModel {})();
    const repositoryA = (() => class oo {})();
    const repositoryB = (() => class oo {})();

    registry.registerRepositoryBinding({ repository: repositoryA, model: modelA, dataSource });
    registry.registerRepositoryBinding({ repository: repositoryB, model: modelB, dataSource });

    expect(registry.getRepositoryBinding({ target: repositoryA })?.model).toBe(modelA);
    expect(registry.getRepositoryBinding({ target: repositoryB })?.model).toBe(modelB);
  });

  test('a subclass with no binding of its own reads its parent', () => {
    const { first: dataSource } = twoDataSourcesNamedXx();
    const model = (() => class ModelC extends IdentityModel {})();
    const parent = (() => class pp {})();
    const child = (() => class extends parent {})();

    registry.registerRepositoryBinding({ repository: parent, model, dataSource });

    expect(registry.getRepositoryBinding({ target: child })?.model).toBe(model);
  });

  test('two same-named datasources each own only their models', () => {
    const { first, second } = twoDataSourcesNamedXx();
    const modelA = (() => class ModelD extends IdentityModel {})();
    const modelB = (() => class ModelE extends IdentityModel {})();

    registry.registerRepositoryBinding({
      repository: (() => class r1 {})(),
      model: modelA,
      dataSource: first,
    });
    registry.registerRepositoryBinding({
      repository: (() => class r2 {})(),
      model: modelB,
      dataSource: second,
    });

    expect(registry.getModelClasses({ dataSource: first })).toEqual([modelA]);
    expect(registry.getModelClasses({ dataSource: second })).toEqual([modelB]);
  });
});
