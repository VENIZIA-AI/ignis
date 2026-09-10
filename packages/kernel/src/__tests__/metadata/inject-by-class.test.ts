import type { IApplicationInfo } from '@/base/applications/common';
import { RestApplication } from '@/base/applications/rest';
import { datasource, inject, repository, service } from '@/base/metadata';
import { AbstractDataSource } from '@/base/datasources';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { MetadataRegistry } from '@/helpers/inversion';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

/** The schema is irrelevant here; `JSON.parse` returns the untyped shape the abstract signature asks for without a cast. */
class ProbeModel extends AbstractEntity {
  getSchema<T>(): T {
    return JSON.parse('{}');
  }
}

class ProbeApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'inject-by-class-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
  override async initialize(): Promise<void> {}
}

const buildApplication = () =>
  new ProbeApplication({
    scope: ProbeApplication.name,
    config: { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: false } },
  });

@service()
class DecoratedService {
  readonly tag = 'decorated';
}

/** No stereotype: the 47 classes BANA registers by hand look exactly like this. */
class ImperativeService {
  readonly tag = 'imperative';
}

/** A declared binding names a seam rather than the class, so the key is not `services.<Class>`. */
@service({ binding: { namespace: BindingNamespaces.SERVICE, key: 'otp-sender' } })
class RenamedService {
  readonly tag = 'renamed';
}

@service()
class OverriddenService {
  readonly tag = 'overridden';
}

describe('the binding key a class is registered under is recorded on the class', () => {
  test('@service records the key it would derive, before any application exists', () => {
    expect(MetadataRegistry.getInstance().getBindingKey({ target: DecoratedService })).toBe(
      `${BindingNamespaces.SERVICE}.DecoratedService`,
    );
  });

  test('a declared binding wins over the derived one', () => {
    expect(MetadataRegistry.getInstance().getBindingKey({ target: RenamedService })).toBe(
      `${BindingNamespaces.SERVICE}.otp-sender`,
    );
  });

  test('registering a class with no stereotype records its key', () => {
    const application = buildApplication();
    application.service(ImperativeService);

    expect(MetadataRegistry.getInstance().getBindingKey({ target: ImperativeService })).toBe(
      `${BindingNamespaces.SERVICE}.ImperativeService`,
    );
  });

  /** The case metadata alone cannot answer: only `registerArtifact` sees the call site's binding. */
  test('a call-site binding override replaces the recorded key', () => {
    const application = buildApplication();
    application.service(OverriddenService, {
      binding: { namespace: BindingNamespaces.SERVICE, key: 'RenamedAtCallSite' },
    });

    expect(MetadataRegistry.getInstance().getBindingKey({ target: OverriddenService })).toBe(
      `${BindingNamespaces.SERVICE}.RenamedAtCallSite`,
    );
  });
});

describe('@inject({ target }) resolves through the application', () => {
  test('resolves a decorated service', () => {
    const application = buildApplication();
    application.service(DecoratedService);

    class Consumer {
      constructor(@inject({ target: DecoratedService }) readonly dependency: DecoratedService) {}
    }

    expect(application.instantiate(Consumer).dependency.tag).toBe('decorated');
  });

  test('resolves a service registered by hand, which carries no artifact metadata', () => {
    const application = buildApplication();
    application.service(ImperativeService);

    class Consumer {
      constructor(@inject({ target: ImperativeService }) readonly dependency: ImperativeService) {}
    }

    expect(application.instantiate(Consumer).dependency.tag).toBe('imperative');
  });

  test('resolves a service whose declared binding renamed it', () => {
    const application = buildApplication();
    application.service(RenamedService);

    class Consumer {
      constructor(@inject({ target: RenamedService }) readonly dependency: RenamedService) {}
    }

    expect(application.instantiate(Consumer).dependency.tag).toBe('renamed');
  });

  /** Positive control: `@service()` recorded a key, so this is the ordinary unbound-key failure. */
  test('a decorated but unregistered class fails as an unbound key', () => {
    const application = buildApplication();

    @service()
    class DecoratedUnregisteredService {}

    class Consumer {
      constructor(
        @inject({ target: DecoratedUnregisteredService })
        readonly dependency: DecoratedUnregisteredService,
      ) {}
    }

    expect(() => application.instantiate(Consumer)).toThrow(
      /services\.DecoratedUnregisteredService is not bounded/,
    );
  });

  /** Positive control: nothing recorded a key, so the container must say so rather than invent one. */
  test('an undecorated, unregistered class is refused by name', () => {
    const application = buildApplication();

    class StrangerService {}

    class Consumer {
      constructor(@inject({ target: StrangerService }) readonly dependency: StrangerService) {}
    }

    expect(() => application.instantiate(Consumer)).toThrow(
      /StrangerService.*not registered as an artifact/,
    );
  });
});

/** `@repository` reads param 0 as a key string; with `{ target }` there is none, so it reads the recorded key. */
@datasource()
class NamedDataSource extends AbstractDataSource {
  constructor() {
    super({ scope: NamedDataSource.name });
  }
  configure(): void {}
}

/** A datasource the application registers by hand, so nothing declares its key but the registration. */
class ImperativeDataSource extends AbstractDataSource {
  constructor() {
    super({ scope: ImperativeDataSource.name });
  }
  configure(): void {}
}

describe('a repository may name its datasource by class at parameter 0', () => {
  test('accepts @inject({ target: <DataSource> }) at parameter 0', () => {
    expect(() => {
      @repository({ model: ProbeModel, dataSource: NamedDataSource })
      class NamedRepository {
        constructor(@inject({ target: NamedDataSource }) readonly dataSource: NamedDataSource) {}
      }
      return NamedRepository;
    }).not.toThrow();
  });

  /** Negative control: the class is a datasource but was never given a key, so the assertion still refuses it. */
  test('refuses a datasource class that carries no recorded key', () => {
    expect(() => {
      @repository({ model: ProbeModel, dataSource: NamedDataSource })
      class UnkeyedRepository {
        constructor(
          @inject({ target: ImperativeDataSource }) readonly dataSource: AbstractDataSource,
        ) {}
      }
      return UnkeyedRepository;
    }).toThrow(/First parameter must be a DataSource/);
  });
});
