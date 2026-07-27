// Import order guard: see controllers/route-registration.test.ts.
import '@/base/applications';

import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import { ControllerTransports } from '@/base/controllers/common/constants';
import { controller, get, model, post, repository, unary } from '@/base/metadata';
import { jsonResponse } from '@/base/models';
import { BasePostgresDataSource } from '@/connectors/postgres/datasources';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { MetadataRegistry } from '@/helpers/inversion';
import { z } from '@hono/zod-openapi';
import { applyMethodDecorator } from '../controllers/fixtures';

const okResponse = jsonResponse({ schema: z.object({ hit: z.string() }), description: 'ok' });
const registry = MetadataRegistry.getInstance();

// --- Route metadata across a class hierarchy -------------------------------------------------

class RegistryBaseController {
  baseRoute() {}
}

class RegistryFirstController extends RegistryBaseController {
  firstRoute() {}
}

class RegistrySecondController extends RegistryBaseController {
  secondRoute() {}
}

applyMethodDecorator({
  decorator: get({ configs: { path: '/base', responses: okResponse } }),
  target: RegistryBaseController.prototype,
  methodName: 'baseRoute',
});
applyMethodDecorator({
  decorator: get({ configs: { path: '/first', responses: okResponse } }),
  target: RegistryFirstController.prototype,
  methodName: 'firstRoute',
});
applyMethodDecorator({
  decorator: post({ configs: { path: '/second', responses: okResponse } }),
  target: RegistrySecondController.prototype,
  methodName: 'secondRoute',
});

// Same shape, gRPC branch.
class RegistryBaseRpcController {
  baseRpc() {}
}

class RegistryChildRpcController extends RegistryBaseRpcController {
  childRpc() {}
}

applyMethodDecorator({
  decorator: unary({ configs: { name: 'BaseRpc' } }),
  target: RegistryBaseRpcController.prototype,
  methodName: 'baseRpc',
});
applyMethodDecorator({
  decorator: unary({ configs: { name: 'ChildRpc' } }),
  target: RegistryChildRpcController.prototype,
  methodName: 'childRpc',
});

// --- Model / repository / datasource metadata ------------------------------------------------

class RegistryDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: this fixture never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

class RegistryEmptyDataSource extends BasePostgresDataSource<{}> {
  configure(): void {
    // no-op: this fixture never opens a real connection.
  }

  getConnectionString(): string {
    return '';
  }
}

@model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })
class RegistryAccount extends BasePostgresEntity<typeof RegistryAccount.schema> {
  static override schema = pgTable('registry_account', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }),
    secret: varchar('secret', { length: 255 }),
  });
}

@repository({ model: RegistryAccount, dataSource: RegistryDataSource })
class RegistryAccountRepository {}

@controller({ path: '/registry-accounts', transport: ControllerTransports.REST })
class RegistryAccountController {}

// ---------------------------------------------------------------------------------------------

describe('MetadataRegistry - routes', () => {
  test('getRoutes preserves registration order', () => {
    const routes = registry.getRoutes({ target: RegistryFirstController.prototype });
    const paths = Array.from(routes?.values() ?? []).map(route => route.path);

    expect(paths).toEqual(['/base', '/first']);
  });

  test('a subclass route does NOT leak back onto its base class', () => {
    const baseRoutes = registry.getRoutes({ target: RegistryBaseController.prototype });

    expect(Array.from(baseRoutes?.keys() ?? [])).toEqual(['baseRoute']);
  });

  test('sibling subclasses do NOT see each other routes', () => {
    const firstRoutes = registry.getRoutes({ target: RegistryFirstController.prototype });
    const secondRoutes = registry.getRoutes({ target: RegistrySecondController.prototype });

    expect(Array.from(firstRoutes?.keys() ?? [])).toEqual(['baseRoute', 'firstRoute']);
    expect(Array.from(secondRoutes?.keys() ?? [])).toEqual(['baseRoute', 'secondRoute']);
  });

  test('a subclass rpc does NOT leak back onto its base class', () => {
    const baseRpcs = registry.getRpcs({ target: RegistryBaseRpcController.prototype });
    const childRpcs = registry.getRpcs({ target: RegistryChildRpcController.prototype });

    expect(Array.from(baseRpcs?.keys() ?? [])).toEqual(['baseRpc']);
    expect(Array.from(childRpcs?.keys() ?? [])).toEqual(['baseRpc', 'childRpc']);
  });

  test('re-registering the same method overwrites instead of accumulating', () => {
    class ReRegisteredController {
      route() {}
    }

    applyMethodDecorator({
      decorator: get({ configs: { path: '/v1', responses: okResponse } }),
      target: ReRegisteredController.prototype,
      methodName: 'route',
    });
    applyMethodDecorator({
      decorator: get({ configs: { path: '/v2', responses: okResponse } }),
      target: ReRegisteredController.prototype,
      methodName: 'route',
    });

    const routes = registry.getRoutes({ target: ReRegisteredController.prototype });
    expect(routes?.size).toBe(1);
    expect(routes?.get('route')?.path).toBe('/v2');
  });

  test('hasRoutes/getRoute round-trip a registered route', () => {
    expect(registry.hasRoutes({ target: RegistryFirstController.prototype })).toBe(true);
    expect(
      registry.getRoute({ target: RegistryFirstController.prototype, methodName: 'firstRoute' })
        ?.path,
    ).toBe('/first');
    expect(registry.hasRoutes({ target: RegistryAccountController.prototype })).toBe(false);
  });
});

describe('MetadataRegistry - controller metadata', () => {
  test('setControllerMetadata round-trips path + transport', () => {
    const metadata = registry.getControllerMetadata({ target: RegistryAccountController });

    expect(metadata?.path).toBe('/registry-accounts');
    expect(registry.getRestControllerMetadata({ target: RegistryAccountController })).toBeDefined();
    expect(
      registry.getGrpcControllerMetadata({ target: RegistryAccountController }),
    ).toBeUndefined();
  });
});

describe('MetadataRegistry - models, repositories, schema', () => {
  test('the model registry keys the entry by class name (no @model tableName / TABLE_NAME) and keeps its settings', () => {
    const entry = registry.getModelEntry({ name: RegistryAccount.name });

    expect(entry).toBeDefined();
    expect(entry?.metadata.settings?.hiddenProperties).toEqual(['secret']);
    expect(registry.getModelEntry({ name: 'registry_account' })).toBeUndefined();
  });

  test('registerModel twice for the same class does not duplicate the entry', () => {
    const before = registry.getAllModels().size;

    model({ type: 'entity', settings: { hiddenProperties: ['secret'] } })(RegistryAccount);

    expect(registry.getAllModels().size).toBe(before);
  });

  test('@repository registers the binding and maps the model onto its datasource', () => {
    const binding = registry.getRepositoryBinding({ name: RegistryAccountRepository.name });

    expect(binding?.model).toBe(RegistryAccount);
    expect(binding?.dataSource).toBe(RegistryDataSource);
    expect(registry.hasModels({ dataSource: RegistryDataSource })).toBe(true);
  });

  test('buildSchema assembles the datasource models keyed by registry name', () => {
    const built = registry.buildSchema({ dataSource: RegistryDataSource });

    expect(built.schema[RegistryAccount.name]).toBe(RegistryAccount.schema);
  });

  test('buildSchema on a datasource with zero models returns empty schema + relations', () => {
    const built = registry.buildSchema({ dataSource: RegistryEmptyDataSource });

    expect(built).toEqual({ schema: {}, relations: {} });
    expect(registry.hasModels({ dataSource: RegistryEmptyDataSource })).toBe(false);
    expect(registry.getModels({ dataSource: RegistryEmptyDataSource })).toEqual([]);
  });
});
