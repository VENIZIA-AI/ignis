// Must precede the controllers/factory import below: avoids a circular-import TDZ error (BaseRestController not yet defined when health-check's controller extends it).
import '@venizia/ignis-kernel';

import { describe, expect, test } from 'bun:test';

import {
  BaseAppErrorMiddleware,
  ControllerFactory,
  model,
  repository,
} from '@venizia/ignis-kernel';
import { BaseSearchEntity, defineSearchCollection, field } from '@/search/core/models';
import { DefaultSearchRepository } from '@/search/typesense/repositories';

import { FakeSearchDataSource } from '../repositories/fake-search-connector';

// Own datasource class (not reused from another test file): the model registry is a process-wide singleton keyed by class name.
class VariantSearchDataSource extends FakeSearchDataSource {}

const COLLECTION = 'crud-body-variants';

/** A collection that requires `createdAt`, as a sort key often is. Nothing on the search path stamps it. */
@model({ type: 'entity' })
class VariantDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: COLLECTION,
    fields: [
      field.string('name', { searchable: true }),
      field.number('createdAt'),
      field.number('modifiedAt', { optional: true }),
    ],
  });
}

@repository({ model: VariantDocument, dataSource: VariantSearchDataSource })
class VariantSearchRepository extends DefaultSearchRepository {}

const VariantCrudController = ControllerFactory.defineCrudController({
  entity: VariantDocument,
  repository: { name: VariantSearchRepository.name },
  controller: { name: 'VariantCrudController', basePath: '/variants' },
});

const openRoutes = async () => {
  const dataSource = new VariantSearchDataSource({ name: 'crud-body-search-ds', config: {} });
  const controller = new VariantCrudController(new VariantSearchRepository(dataSource));
  const router = await controller.configure();
  // The handler an application installs on its server: without it a failed validation is a bare 500.
  router.onError(new BaseAppErrorMiddleware().value());

  const send = (opts: { method: string; path: string; body: object }) => {
    return router.request(opts.path, {
      method: opts.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.body),
    });
  };

  return { send, engine: dataSource.fakeConnector };
};

describe('defineCrudController over a search entity keeps the audit-named fields', () => {
  test('a search entity stamps nothing', () => {
    expect(new VariantDocument().getServerStampedKeys()).toEqual([]);
  });

  test('POST keeps the required createdAt and hands it to the engine', async () => {
    const { send, engine } = await openRoutes();
    const document = {
      id: 'v1',
      name: 'Coffee',
      createdAt: 1758600000000,
      modifiedAt: 1758600000000,
    };

    const response = await send({ method: 'POST', path: '/', body: document });

    expect(response.status).toBe(201);
    expect(engine.createDocumentCalls).toEqual([{ collection: COLLECTION, document }]);
  });

  test('POST without createdAt is refused before the engine, as the collection requires it', async () => {
    const { send, engine } = await openRoutes();

    const response = await send({ method: 'POST', path: '/', body: { id: 'v2', name: 'Tea' } });

    expect(response.status).toBe(422);
    expect(engine.createDocumentCalls).toEqual([]);
  });

  test('PATCH /:id still sets modifiedAt', async () => {
    const { send, engine } = await openRoutes();

    const response = await send({
      method: 'PATCH',
      path: '/v1',
      body: { modifiedAt: 1758600000001 },
    });

    expect(response.status).toBe(200);
    expect(engine.updateDocumentCalls).toEqual([
      { collection: COLLECTION, id: 'v1', document: { modifiedAt: 1758600000001 } },
    ]);
  });
});
