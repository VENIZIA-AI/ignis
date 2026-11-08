import { CrudRoutes } from '@/base/controllers/common';
import { ControllerFactory } from '@/base/controllers/factory/controller';
import { controller, repository } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, Container } from '@/helpers/inversion';
import { z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { RestorableStubRepository, StubRepository } from './stub-repository';

const itemSchema = z.object({ id: z.string(), title: z.string() });
const schemas: Record<string, AnyType> = { item: itemSchema };

class RoutesProbeItem extends AbstractEntity<typeof itemSchema> {
  constructor() {
    super({ name: RoutesProbeItem.name });
  }

  getSchema<T>(): T {
    return schemas.item;
  }
}

@repository({ model: RoutesProbeItem, dataSource: 'ProbeDataSource' })
class PlainProbeRepository extends StubRepository {}

/** Has `restoreById` and not `restoreBy`: the restore routes need both. */
@repository({ model: RoutesProbeItem, dataSource: 'ProbeDataSource' })
class HalfRestorableRepository extends StubRepository {
  restoreById(_opts?: AnyType): Promise<AnyType> {
    return Promise.resolve({ count: 0, data: null });
  }
}

/** Answers the restore verbs and `findById`, the verbs the tests reach over HTTP. */
@repository({ model: RoutesProbeItem, dataSource: 'ProbeDataSource' })
class SoftProbeRepository extends RestorableStubRepository {
  readonly restored: object[] = [];

  override findById(opts: { id: string }): Promise<AnyType> {
    return Promise.resolve({ id: opts.id, title: 'found' });
  }

  override restoreById(opts: { id: string }): Promise<AnyType> {
    this.restored.push({ id: opts.id });

    return Promise.resolve({ count: 1, data: { id: opts.id, title: 'restored' } });
  }

  override restoreBy(opts: { where: object }): Promise<AnyType> {
    this.restored.push({ where: opts.where });

    return Promise.resolve({ count: 1, data: [{ id: '1', title: 'restored' }] });
  }
}

const open = async (opts: {
  controllerClass: new (repositoryInstance: AnyType) => { configure(): Promise<AnyType> };
  repositoryInstance: object;
  repositoryName: string;
}) => {
  const container = new Container();
  container
    .bind({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: opts.repositoryName,
      }),
    })
    .toValue(opts.repositoryInstance);

  return container.resolve(opts.controllerClass).configure();
};

const statusOf = async (opts: { router: AnyType; method: string; path: string }) => {
  const response = await opts.router.request(opts.path, { method: opts.method });

  return response.status;
};

describe('ControllerFactory.crud - a route exists only when it is listed', () => {
  test('a listed route is served, every other route answers 404', async () => {
    const CrudController = ControllerFactory.crud({
      repository: PlainProbeRepository,
      routes: { count: true },
    });

    @controller({ path: '/items' })
    class OnlyCountController extends CrudController {}

    const router = await open({
      controllerClass: OnlyCountController,
      repositoryInstance: new PlainProbeRepository('x'),
      repositoryName: 'PlainProbeRepository',
    });

    const status1 = await statusOf({ router, method: 'GET', path: '/count?where=%7B%7D' });

    expect(status1).toBe(200);
    const status2 = await statusOf({ router, method: 'GET', path: '/' });
    expect(status2).toBe(404);
    const status3 = await statusOf({ router, method: 'GET', path: '/1' });
    expect(status3).toBe(404);
    const status4 = await statusOf({ router, method: 'POST', path: '/' });
    expect(status4).toBe(404);
    const status5 = await statusOf({ router, method: 'DELETE', path: '/1' });
    expect(status5).toBe(404);
  });

  test('no routes at all means no route', async () => {
    const CrudController = ControllerFactory.crud({ repository: PlainProbeRepository });

    @controller({ path: '/none' })
    class NoRoutesController extends CrudController {}

    const router = await open({
      controllerClass: NoRoutesController,
      repositoryInstance: new PlainProbeRepository('x'),
      repositoryName: 'PlainProbeRepository',
    });

    const status6 = await statusOf({ router, method: 'GET', path: '/count' });

    expect(status6).toBe(404);
  });

  test('CrudRoutes.READ lists the four read routes and no write route', async () => {
    expect(Object.keys(CrudRoutes.READ).sort()).toEqual(['count', 'find', 'findById', 'findOne']);

    const CrudController = ControllerFactory.crud({
      repository: PlainProbeRepository,
      routes: { ...CrudRoutes.READ },
    });

    @controller({ path: '/read' })
    class ReadController extends CrudController {}

    const router = await open({
      controllerClass: ReadController,
      repositoryInstance: new PlainProbeRepository('x'),
      repositoryName: 'PlainProbeRepository',
    });

    const status7 = await statusOf({ router, method: 'GET', path: '/count?where=%7B%7D' });

    expect(status7).toBe(200);
    const status8 = await statusOf({ router, method: 'GET', path: '/1' });
    expect(status8).not.toBe(404);
    const status9 = await statusOf({ router, method: 'POST', path: '/' });
    expect(status9).toBe(404);
    const status10 = await statusOf({ router, method: 'PATCH', path: '/1' });
    expect(status10).toBe(404);
    const status11 = await statusOf({ router, method: 'DELETE', path: '/1' });
    expect(status11).toBe(404);
  });

  test('enabled, readonly and enabledRoutes no longer exist', () => {
    ControllerFactory.crud({
      repository: PlainProbeRepository,
      // @ts-expect-error a route is on when it is listed: there is no `enabled`
      routes: { find: { enabled: false } },
    });
    ControllerFactory.crud({
      repository: PlainProbeRepository,
      // @ts-expect-error there is no `readonly`: list the routes you want
      readonly: true,
    });
    ControllerFactory.crud({
      repository: PlainProbeRepository,
      // @ts-expect-error there is no `enabledRoutes`: list the routes you want
      enabledRoutes: ['find'],
    });
    ControllerFactory.crud({
      repository: PlainProbeRepository,
      // @ts-expect-error the path is on @controller, and the name is the class
      controller: { name: 'X', basePath: '/x' },
    });

    expect(true).toBe(true);
  });
});

describe('ControllerFactory.crud - the restore routes', () => {
  test('restoreById and restoreBy are listed on a repository that has the restore methods', async () => {
    const CrudController = ControllerFactory.crud({
      repository: SoftProbeRepository,
      routes: { restoreById: true, restoreBy: true },
    });

    @controller({ path: '/soft' })
    class SoftController extends CrudController {}

    const repositoryInstance = new SoftProbeRepository('x');
    const router = await open({
      controllerClass: SoftController,
      repositoryInstance,
      repositoryName: 'SoftProbeRepository',
    });

    const byId = await router.request('/7/restore', { method: 'POST' });

    expect(byId.status).toBe(200);
    const body12 = await byId.json();
    expect(body12).toEqual({ count: 1, data: { id: '7', title: 'restored' } });

    const by = await router.request('/restore?where=%7B%22title%22%3A%22a%22%7D', {
      method: 'POST',
    });

    expect(by.status).toBe(200);
    const body13 = await by.json();
    expect(body13).toEqual({ count: 1, data: [{ id: '1', title: 'restored' }] });
    expect(repositoryInstance.restored).toEqual([{ id: '7' }, { where: { title: 'a' } }]);
  });

  test('restoreBy without a where is a 400, and restores nothing', async () => {
    const CrudController = ControllerFactory.crud({
      repository: SoftProbeRepository,
      routes: { restoreBy: true },
    });

    @controller({ path: '/softly' })
    class SoftlyController extends CrudController {}

    const repositoryInstance = new SoftProbeRepository('x');
    const router = await open({
      controllerClass: SoftlyController,
      repositoryInstance,
      repositoryName: 'SoftProbeRepository',
    });

    const status14 = await statusOf({ router, method: 'POST', path: '/restore' });

    expect(status14).toBe(400);
    expect(repositoryInstance.restored).toEqual([]);
  });

  test('a repository without restore methods is a compile error, and a throw when the controller is built', () => {
    expect(() =>
      ControllerFactory.crud({
        repository: PlainProbeRepository,
        // @ts-expect-error this repository has no restoreById
        routes: { restoreById: true },
      }),
    ).toThrow('a restore route needs a repository with both restoreById and restoreBy');
    expect(() =>
      ControllerFactory.crud({
        repository: PlainProbeRepository,
        // @ts-expect-error this repository has no restoreBy
        routes: { restoreBy: true },
      }),
    ).toThrow('a restore route needs a repository with both restoreById and restoreBy');
  });

  test('a repository with only one restore method refuses both restore routes', () => {
    expect(() =>
      ControllerFactory.crud({
        repository: HalfRestorableRepository,
        // @ts-expect-error restoreBy is missing, and the route needs both methods
        routes: { restoreById: true },
      }),
    ).toThrow('a restore route needs a repository with both restoreById and restoreBy');
    expect(() =>
      ControllerFactory.crud({
        repository: HalfRestorableRepository,
        // @ts-expect-error restoreBy is missing
        routes: { restoreBy: true },
      }),
    ).toThrow('a restore route needs a repository with both restoreById and restoreBy');
  });
});

describe('ControllerFactory.crud - routes of the subclass come first', () => {
  test('a custom static path declared in binding() wins over GET /{id}', async () => {
    const CrudController = ControllerFactory.crud({
      repository: SoftProbeRepository,
      routes: { ...CrudRoutes.READ },
    });

    @controller({ path: '/orders' })
    class OrderController extends CrudController {
      override binding() {
        this.router.get('/launchpad', (context) => context.text('custom'));
      }
    }

    const router = await open({
      controllerClass: OrderController,
      repositoryInstance: new SoftProbeRepository('x'),
      repositoryName: 'SoftProbeRepository',
    });

    const custom = await router.request('/launchpad');

    expect(custom.status).toBe(200);
    const text15 = await custom.text();
    expect(text15).toBe('custom');

    const byId = await router.request('/42');

    expect(byId.status).toBe(200);
    const body16 = await byId.json();
    expect(body16).toEqual({ count: 1, data: { id: '42', title: 'found' } });
  });
});
