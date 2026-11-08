import { CrudRoutes } from '@/base/controllers/common';
import { ControllerFactory } from '@/base/controllers/factory/controller';
import {
  controller as controllerDecorator,
  inject,
  repository as repositoryDecorator,
} from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, Container, MetadataRegistry } from '@/helpers/inversion';
import { z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';
import { StubRepository } from './stub-repository';

const itemSchema = z.object({ id: z.string(), title: z.string() });

/** One zod object for every schema type, held untyped so the generic abstract signature accepts it without a cast. */
const schemas: Record<string, AnyType> = { item: itemSchema };

class InjectionProbeItem extends AbstractEntity<typeof itemSchema> {
  constructor() {
    super({ name: InjectionProbeItem.name });
  }

  getSchema<T>(): T {
    return schemas.item;
  }
}

@repositoryDecorator({ model: InjectionProbeItem, dataSource: 'ProbeDataSource' })
class InjectionProbeItemRepository extends StubRepository {}

const repositoryKey = (opts: { name: string }) => {
  return BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: opts.name });
};

const buildContainer = () => {
  const container = new Container();
  container
    .bind({ key: repositoryKey({ name: 'InjectionProbeItemRepository' }) })
    .toValue(new InjectionProbeItemRepository('named'));
  container
    .bind({ key: repositoryKey({ name: 'ExplicitProbeRepository' }) })
    .toValue(new InjectionProbeItemRepository('explicit-one'));

  return container;
};

const ItemCrudController = ControllerFactory.crud({
  repository: InjectionProbeItemRepository,
  routes: CrudRoutes.READ,
});

@controllerDecorator({ path: '/items' })
class ItemController extends ItemCrudController {}

@controllerDecorator({ path: '/items' })
class ExplicitItemController extends ItemCrudController {
  constructor(
    @inject({ key: repositoryKey({ name: 'ExplicitProbeRepository' }) })
    repository: ConstructorParameters<typeof ItemCrudController>[0],
  ) {
    super(repository);
  }
}

/** A second subclass of the same generated base with no constructor: the explicit sibling above must not have rewritten what the base injects. */
@controllerDecorator({ path: '/items' })
class SiblingItemController extends ItemCrudController {}

const countThrough = async (opts: { controller: ItemController }) => {
  const router = await opts.controller.configure();
  const response = await router.request(`/count?where=${encodeURIComponent('{}')}`);
  const result = await response.json();

  return { status: response.status, body: result };
};

describe('ControllerFactory.crud injects the repository class it is given', () => {
  test('a subclass with no constructor resolves its repository and serves GET /count', async () => {
    const container = buildContainer();
    const resolved = container.resolve(ItemController);

    const result = await countThrough({ controller: resolved });
    expect(result).toEqual({
      status: 200,
      body: { count: 'named'.length },
    });
  });

  test('a subclass that declares its own @inject constructor keeps its explicit repository', async () => {
    const container = buildContainer();
    const resolved = container.resolve(ExplicitItemController);

    const result = await countThrough({ controller: resolved });
    expect(result).toEqual({
      status: 200,
      body: { count: 'explicit-one'.length },
    });
  });

  test('an explicit sibling does not change what another subclass of the same base receives', async () => {
    const container = buildContainer();
    const resolved = container.resolve(SiblingItemController);

    const result = await countThrough({ controller: resolved });
    expect(result).toEqual({
      status: 200,
      body: { count: 'named'.length },
    });
  });

  test('a repository class with an empty name is refused when the controller is defined', () => {
    @repositoryDecorator({ model: InjectionProbeItem, dataSource: 'ProbeDataSource' })
    class Anonymous extends StubRepository {}

    Object.defineProperty(Anonymous, 'name', { value: '' });

    expect(() => ControllerFactory.crud({ repository: Anonymous })).toThrow(
      '[ControllerFactory.crud] Invalid repository name',
    );
  });
});

describe('ControllerFactory.registerRepositoryInjection - the one injection every generated controller uses', () => {
  test('records repositories.<name> at parameter 0, required', () => {
    class GeneratedProbeController {}

    ControllerFactory.registerRepositoryInjection({
      target: GeneratedProbeController,
      factoryName: 'defineProbeController',
      repositoryName: 'ProbeRepository',
    });

    expect(
      MetadataRegistry.getInstance().getInjectMetadata({ target: GeneratedProbeController }),
    ).toEqual([{ key: repositoryKey({ name: 'ProbeRepository' }), index: 0, isOptional: false }]);
  });

  test('the target is a class - a plain function is a compile error', () => {
    const plainFunction = () => undefined;

    ControllerFactory.registerRepositoryInjection({
      // @ts-expect-error - a factory registers the injection on the class it generated, never on a plain function
      target: plainFunction,
      factoryName: 'defineProbeController',
      repositoryName: 'ProbeRepository',
    });

    expect(MetadataRegistry.getInstance().getInjectMetadata({ target: plainFunction })).toEqual([
      { key: repositoryKey({ name: 'ProbeRepository' }), index: 0, isOptional: false },
    ]);
  });

  test('an empty name throws before anything is recorded, naming the calling factory', () => {
    class NamelessProbeController {}

    expect(() =>
      ControllerFactory.registerRepositoryInjection({
        target: NamelessProbeController,
        factoryName: 'defineProbeController',
        repositoryName: '',
      }),
    ).toThrow('[defineProbeController] Invalid repository name');
    expect(
      MetadataRegistry.getInstance().getInjectMetadata({ target: NamelessProbeController }),
    ).toBeUndefined();
  });
});
