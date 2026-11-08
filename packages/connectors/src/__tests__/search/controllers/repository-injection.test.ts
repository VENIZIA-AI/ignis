// Must precede the controllers/factory import below: avoids a circular-import TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import {
  BindingKeys,
  BindingNamespaces,
  Container,
  controller,
  inject,
  repository as repositoryDecorator,
} from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import {
  FakeSearchDataSource,
  ProductDocument,
  type TProductDocument,
} from '../repositories/fake-search-connector';

class InjectionProbeDataSource extends FakeSearchDataSource {}

@repositoryDecorator({ model: ProductDocument, dataSource: InjectionProbeDataSource })
class InjectionProbeSearchRepository extends DefaultSearchRepository<TProductDocument> {}

/** A repository class that declares no model. */
class ModelessSearchRepository extends DefaultSearchRepository<TProductDocument> {}

/** Stands in for a search repository; the tag tells the bound instances apart. */
class TaggedSearchRepository {
  constructor(readonly tag: string) {}
}

const repositoryKey = (opts: { name: string }) => {
  return BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: opts.name });
};

const namedRepository = new TaggedSearchRepository('named');
const explicitRepository = new TaggedSearchRepository('explicit');

const buildContainer = () => {
  const container = new Container();
  container
    .bind({ key: repositoryKey({ name: 'InjectionProbeSearchRepository' }) })
    .toValue(namedRepository);
  container
    .bind({ key: repositoryKey({ name: 'ExplicitProbeSearchRepository' }) })
    .toValue(explicitRepository);

  return container;
};

const ProbeSearchBase = SearchControllerFactory.build({
  repository: InjectionProbeSearchRepository,
  routes: { search: true },
});

@controller({ path: '/probe-products' })
class ProbeSearchController extends ProbeSearchBase {}

@controller({ path: '/probe-products' })
class ExplicitProbeSearchController extends ProbeSearchBase {
  constructor(
    @inject({ key: repositoryKey({ name: 'ExplicitProbeSearchRepository' }) })
    repository: ConstructorParameters<typeof ProbeSearchBase>[0],
  ) {
    super(repository);
  }
}

/** A second subclass with no constructor: the explicit sibling above must not have rewritten what the base injects. */
@controller({ path: '/probe-products' })
class SiblingProbeSearchController extends ProbeSearchBase {}

describe('SearchControllerFactory.build injects the repository class', () => {
  test('a subclass with no constructor resolves the named repository', () => {
    const resolved = buildContainer().resolve(ProbeSearchController);

    expect<unknown>(resolved.repository).toBe(namedRepository);
  });

  test('a subclass that declares its own @inject constructor keeps its explicit repository', () => {
    const resolved = buildContainer().resolve(ExplicitProbeSearchController);

    expect<unknown>(resolved.repository).toBe(explicitRepository);
  });

  test('an explicit sibling does not change what another subclass of the same base receives', () => {
    const resolved = buildContainer().resolve(SiblingProbeSearchController);

    expect<unknown>(resolved.repository).toBe(namedRepository);
  });

  test('a repository class without @repository({ model }) is refused when the controller is built', () => {
    expect(() =>
      SearchControllerFactory.build({
        repository: ModelessSearchRepository,
        routes: { search: true },
      }),
    ).toThrow('[SearchControllerFactory.build] Cannot resolve the entity');
  });
});
