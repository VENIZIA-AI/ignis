// Must precede the controllers/factory import below: avoids a circular-import TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import {
  BindingKeys,
  BindingNamespaces,
  Container,
  controller,
  inject,
} from '@venizia/ignis-kernel';
import { SearchControllerFactory } from '@/search/core/controllers/factory';

import { ProductDocument } from '../repositories/fake-search-connector';

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

const ProbeSearchBase = SearchControllerFactory.defineSearchController({
  entity: ProductDocument,
  repository: { name: 'InjectionProbeSearchRepository' },
  controller: { name: 'ProbeSearchController', basePath: '/probe-products' },
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

describe('defineSearchController injects the repository named in repository.name', () => {
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

  test('an empty repository name is refused when the controller is defined', () => {
    expect(() =>
      SearchControllerFactory.defineSearchController({
        entity: ProductDocument,
        repository: { name: '' },
        controller: { name: 'NamelessSearchController', basePath: '/nameless' },
      }),
    ).toThrow(
      '[defineSearchController] Invalid repository name | controller: NamelessSearchController',
    );
  });
});
