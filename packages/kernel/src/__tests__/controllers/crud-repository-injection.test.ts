import { ControllerFactory } from '@/base/controllers/factory/controller';
import { registerFactoryRepositoryInjection } from '@/base/controllers/factory/repository-injection';
import { controller, inject } from '@/base/metadata';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, Container, MetadataRegistry } from '@/helpers/inversion';
import { z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

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

/** Answers the one read the tests call; the tag tells the two bound repositories apart. */
class CountingRepository {
  constructor(readonly tag: string) {}

  async count() {
    return { count: this.tag.length };
  }
}

const repositoryKey = (opts: { name: string }) => {
  return BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: opts.name });
};

const buildContainer = () => {
  const container = new Container();
  container
    .bind({ key: repositoryKey({ name: 'InjectionProbeItemRepository' }) })
    .toValue(new CountingRepository('named'));
  container
    .bind({ key: repositoryKey({ name: 'ExplicitProbeRepository' }) })
    .toValue(new CountingRepository('explicit-one'));
  return container;
};

const ItemCrudController = ControllerFactory.defineCrudController({
  entity: InjectionProbeItem,
  repository: { name: 'InjectionProbeItemRepository' },
  controller: { name: 'ItemController', basePath: '/items' },
});

@controller({ path: '/items' })
class ItemController extends ItemCrudController {}

@controller({ path: '/items' })
class ExplicitItemController extends ItemCrudController {
  constructor(
    @inject({ key: repositoryKey({ name: 'ExplicitProbeRepository' }) })
    repository: ConstructorParameters<typeof ItemCrudController>[0],
  ) {
    super(repository);
  }
}

/** A second subclass of the same generated base with no constructor: the explicit sibling above must not have rewritten what the base injects. */
@controller({ path: '/items' })
class SiblingItemController extends ItemCrudController {}

const countThrough = async (opts: { controller: ItemController }) => {
  const router = await opts.controller.configure();
  const response = await router.request(`/count?where=${encodeURIComponent('{}')}`);
  return { status: response.status, body: await response.json() };
};

describe('defineCrudController injects the repository named in repository.name', () => {
  test('a subclass with no constructor resolves its repository and serves GET /count', async () => {
    const container = buildContainer();
    const resolved = container.resolve(ItemController);

    expect(await countThrough({ controller: resolved })).toEqual({
      status: 200,
      body: { count: 'named'.length },
    });
  });

  test('a subclass that declares its own @inject constructor keeps its explicit repository', async () => {
    const container = buildContainer();
    const resolved = container.resolve(ExplicitItemController);

    expect(await countThrough({ controller: resolved })).toEqual({
      status: 200,
      body: { count: 'explicit-one'.length },
    });
  });

  test('an explicit sibling does not change what another subclass of the same base receives', async () => {
    const container = buildContainer();
    const resolved = container.resolve(SiblingItemController);

    expect(await countThrough({ controller: resolved })).toEqual({
      status: 200,
      body: { count: 'named'.length },
    });
  });

  test('an empty repository name is refused when the controller is defined', () => {
    expect(() =>
      ControllerFactory.defineCrudController({
        entity: InjectionProbeItem,
        repository: { name: '' },
        controller: { name: 'NamelessItemController', basePath: '/nameless' },
      }),
    ).toThrow(
      '[defineCrudController] Invalid repository name | controller: NamelessItemController',
    );
  });
});

describe('registerFactoryRepositoryInjection - the one injection every generated controller uses', () => {
  test('records repositories.<name> at parameter 0, required', () => {
    class GeneratedProbeController {}

    registerFactoryRepositoryInjection({
      target: GeneratedProbeController,
      factoryName: 'defineProbeController',
      controllerName: 'GeneratedProbeController',
      repositoryName: 'ProbeRepository',
    });

    expect(
      MetadataRegistry.getInstance().getInjectMetadata({ target: GeneratedProbeController }),
    ).toEqual([{ key: repositoryKey({ name: 'ProbeRepository' }), index: 0, isOptional: false }]);
  });

  test('the target is a class - a plain function is a compile error', () => {
    const plainFunction = () => undefined;

    registerFactoryRepositoryInjection({
      // @ts-expect-error - a factory registers the injection on the class it generated, never on a plain function
      target: plainFunction,
      factoryName: 'defineProbeController',
      controllerName: 'PlainFunction',
      repositoryName: 'ProbeRepository',
    });

    expect(MetadataRegistry.getInstance().getInjectMetadata({ target: plainFunction })).toEqual([
      { key: repositoryKey({ name: 'ProbeRepository' }), index: 0, isOptional: false },
    ]);
  });

  test('an empty name throws before anything is recorded, naming the calling factory', () => {
    class NamelessProbeController {}

    expect(() =>
      registerFactoryRepositoryInjection({
        target: NamelessProbeController,
        factoryName: 'defineProbeController',
        controllerName: 'NamelessProbeController',
        repositoryName: '',
      }),
    ).toThrow(
      '[defineProbeController] Invalid repository name | controller: NamelessProbeController',
    );
    expect(
      MetadataRegistry.getInstance().getInjectMetadata({ target: NamelessProbeController }),
    ).toBeUndefined();
  });
});
