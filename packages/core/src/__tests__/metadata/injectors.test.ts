// Import order guard: see controllers/route-registration.test.ts.
import '@/base/applications';

import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import { inject, model, repository } from '@/base/metadata';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { MetadataRegistry } from '@/helpers/inversion';
import type { AnyType } from '@venizia/ignis-helpers';

const registry = MetadataRegistry.getInstance();

class InjectorPrimaryDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: this fixture never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

class InjectorSecondaryDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: this fixture never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

@model({ type: 'entity' })
class InjectorAccount extends BasePostgresEntity<typeof InjectorAccount.schema> {
  static override schema = pgTable('injector_account', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }),
  });
}

/** bun does not resolve the tsconfig `extends` chain carrying `experimentalDecorators`, so `@inject` and `design:paramtypes` never emit in these tests - both are reproduced by hand as `tsc` emits them. */
const declareParamTypes = (opts: { target: Function; paramTypes: Array<Function> }): void => {
  Reflect.defineMetadata('design:paramtypes', opts.paramTypes, opts.target);
};

const applyParamInject = (opts: { target: Function; index: number; key: string }): void => {
  (inject({ key: opts.key }) as AnyType)(opts.target, undefined, opts.index);
};

describe('@repository - datasource auto-injection at param[0]', () => {
  test('a repository with no constructor gets the datasource injected at param[0]', () => {
    class AutoInjectedRepository {}

    repository({ model: InjectorAccount, dataSource: InjectorPrimaryDataSource })(
      AutoInjectedRepository,
    );

    const injects = registry.getInjectMetadata({ target: AutoInjectedRepository });
    expect(injects?.[0]).toEqual({
      key: 'datasources.InjectorPrimaryDataSource',
      index: 0,
      isOptional: false,
    });
  });

  test('a string dataSource name yields the same namespaced binding key', () => {
    class StringDataSourceRepository {}

    repository({ model: InjectorAccount, dataSource: 'InjectorPrimaryDataSource' })(
      StringDataSourceRepository,
    );

    expect(registry.getInjectMetadata({ target: StringDataSourceRepository })?.[0]?.key).toBe(
      'datasources.InjectorPrimaryDataSource',
    );
  });

  test('resolver-form model and dataSource are resolved into the binding', () => {
    class ResolvedRepository {}

    repository({ model: () => InjectorAccount, dataSource: () => InjectorPrimaryDataSource })(
      ResolvedRepository,
    );

    const binding = registry.getRepositoryBinding({ name: ResolvedRepository.name });
    expect(binding?.model).toBe(InjectorAccount);
    expect(binding?.dataSource).toBe(InjectorPrimaryDataSource);
  });

  test('an explicit @inject at param[0] wins - the auto-injection does NOT overwrite it', () => {
    class ExplicitInjectRepository {
      constructor(public dataSource: InjectorSecondaryDataSource) {}
    }

    declareParamTypes({
      target: ExplicitInjectRepository,
      paramTypes: [InjectorSecondaryDataSource],
    });
    applyParamInject({
      target: ExplicitInjectRepository,
      index: 0,
      key: 'datasources.InjectorSecondaryDataSource',
    });

    repository({ model: InjectorAccount, dataSource: InjectorSecondaryDataSource })(
      ExplicitInjectRepository,
    );

    expect(registry.getInjectMetadata({ target: ExplicitInjectRepository })?.[0]?.key).toBe(
      'datasources.InjectorSecondaryDataSource',
    );
  });

  test('an explicit @inject at param[0] with a non-datasource key is rejected', () => {
    class ServiceInjectedRepository {
      constructor(public dataSource: InjectorPrimaryDataSource) {}
    }

    declareParamTypes({
      target: ServiceInjectedRepository,
      paramTypes: [InjectorPrimaryDataSource],
    });
    applyParamInject({
      target: ServiceInjectedRepository,
      index: 0,
      key: 'services.AccountService',
    });

    expect(() => {
      repository({ model: InjectorAccount, dataSource: InjectorPrimaryDataSource })(
        ServiceInjectedRepository,
      );
    }).toThrow(/First parameter must be a DataSource/);
  });

  test('a constructor whose first parameter is not a DataSource is rejected', () => {
    class NotADataSource {}
    class BadConstructorRepository {
      constructor(public other: NotADataSource) {}
    }

    declareParamTypes({ target: BadConstructorRepository, paramTypes: [NotADataSource] });

    expect(() => {
      repository({ model: InjectorAccount, dataSource: InjectorPrimaryDataSource })(
        BadConstructorRepository,
      );
    }).toThrow(/must extend AbstractDataSource/);
  });

  test('a constructor DataSource type incompatible with @repository dataSource is rejected', () => {
    class MismatchedRepository {
      constructor(public dataSource: InjectorSecondaryDataSource) {}
    }

    declareParamTypes({ target: MismatchedRepository, paramTypes: [InjectorSecondaryDataSource] });

    expect(() => {
      repository({ model: InjectorAccount, dataSource: InjectorPrimaryDataSource })(
        MismatchedRepository,
      );
    }).toThrow(/Type mismatch/);
  });

  test('a repository subclass gets ITS OWN dataSource injected, not the base repository one', () => {
    class BaseAccountRepository {}
    class ReplicaAccountRepository extends BaseAccountRepository {}

    repository({ model: InjectorAccount, dataSource: InjectorPrimaryDataSource })(
      BaseAccountRepository,
    );
    repository({ model: InjectorAccount, dataSource: InjectorSecondaryDataSource })(
      ReplicaAccountRepository,
    );

    expect(registry.getInjectMetadata({ target: ReplicaAccountRepository })?.[0]?.key).toBe(
      'datasources.InjectorSecondaryDataSource',
    );

    // ...and the subclass must not have rewritten the base repository's own injection.
    expect(registry.getInjectMetadata({ target: BaseAccountRepository })?.[0]?.key).toBe(
      'datasources.InjectorPrimaryDataSource',
    );
  });

  test('@repository without a model or without a dataSource is rejected', () => {
    class NoModelRepository {}
    class NoDataSourceRepository {}

    expect(() => {
      repository({ dataSource: InjectorPrimaryDataSource } as AnyType)(NoModelRepository);
    }).toThrow(/Missing 'model'/);

    expect(() => {
      repository({ model: InjectorAccount } as AnyType)(NoDataSourceRepository);
    }).toThrow(/Missing 'dataSource'/);
  });
});

describe('@inject - property injection', () => {
  test('a property @inject records property metadata, not constructor metadata', () => {
    class PropertyInjectedService {
      dataSource!: InjectorPrimaryDataSource;
    }

    (inject({ key: 'datasources.InjectorPrimaryDataSource' }) as AnyType)(
      PropertyInjectedService.prototype,
      'dataSource',
      undefined,
    );

    const properties = registry.getPropertiesMetadata({
      target: PropertyInjectedService.prototype,
    });
    expect(properties?.get('dataSource')).toEqual({
      bindingKey: 'datasources.InjectorPrimaryDataSource',
      isOptional: false,
    });
    expect(registry.getInjectMetadata({ target: PropertyInjectedService })).toBeUndefined();
  });

  test('@inject outside a property or constructor parameter is rejected', () => {
    expect(() => {
      (inject({ key: 'datasources.InjectorPrimaryDataSource' }) as AnyType)(
        class Orphan {},
        undefined,
        undefined,
      );
    }).toThrow(/class properties or constructor parameters/);
  });
});
