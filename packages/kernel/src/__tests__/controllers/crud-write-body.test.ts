import type { TAnyObjectSchema } from '@/base/controllers/common/schema-builders';
import { ControllerFactory } from '@/base/controllers/factory/controller';
import { defineControllerRouteConfigs } from '@/base/controllers/factory/definition';
import { AbstractEntity } from '@/base/models';
import { BindingNamespaces } from '@/common/bindings';
import { BindingKeys, Container } from '@/helpers/inversion';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

/** The shape an entity with the audit and timestamp enrichers exposes; `deletedAt` is soft-delete state, not a stamp. */
const auditedShape = {
  id: z.string().optional(),
  code: z.string(),
  createdBy: z.number().nullable().optional(),
  modifiedBy: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  modifiedAt: z.string().optional(),
  deletedAt: z.string().nullable().optional(),
};

const auditedSchema = z.object(auditedShape);
const plainSchema = z.object({ id: z.string().optional(), code: z.string() });
const plainUpdateSchema = z.object({ code: z.string().optional() });

/** What a relational entity with both enrichers reports. */
const AUDIT_KEYS = ['createdBy', 'modifiedBy', 'createdAt', 'modifiedAt'];

/** A `.transform()` pipe is no object schema, so the typed signature refuses it; held untyped to reach the runtime guard without a cast. */
const untypedSchemas: Record<string, AnyType> = {
  transformed: z.object({ code: z.string() }).transform(value => value),
};

type TRouteWithBody = {
  request: { body: { content: { 'application/json': { schema: TAnyObjectSchema } } } };
};

const toBody = (opts: { route: TRouteWithBody }) => {
  return opts.route.request.body.content['application/json'].schema;
};

const toBodyKeys = (opts: { route: TRouteWithBody }) => {
  return Object.keys(toBody(opts).shape).sort();
};

const buildRoutes = (opts: {
  create: TAnyObjectSchema;
  update?: TAnyObjectSchema;
  serverStampedKeys?: string[];
  routes?: Parameters<typeof defineControllerRouteConfigs>[0]['routes'];
}) => {
  return defineControllerRouteConfigs({
    isStrict: true,
    idType: 'string',
    schema: { select: plainSchema, create: opts.create, update: opts.update ?? opts.create },
    serverStampedKeys: opts.serverStampedKeys,
    routes: opts.routes,
  });
};

/** The request body a generated OpenAPI document declares for one write route. */
const toDocumentedBody = (opts: { route: TRouteWithBody }) => {
  const application = new OpenAPIHono();
  application.openapi(
    createRoute({
      method: 'post',
      path: '/probe',
      request: { body: opts.route.request.body },
      responses: { 200: { description: 'ok' } },
    }),
    context => context.text('ok'),
  );

  const document = application.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'crud-write-body-probe', version: '1' },
  });
  return document.paths?.['/probe']?.post?.requestBody;
};

describe('the CRUD factory default write bodies leave out what the entity stamps', () => {
  test('create drops the keys the entity stamps and keeps id', () => {
    const routes = buildRoutes({ create: auditedSchema, serverStampedKeys: AUDIT_KEYS });

    expect(toBodyKeys({ route: routes.CREATE })).toEqual(['code', 'deletedAt', 'id']);
  });

  test('updateById and updateBy also drop id: the path or where names the rows', () => {
    const routes = buildRoutes({ create: auditedSchema, serverStampedKeys: AUDIT_KEYS });

    expect(toBodyKeys({ route: routes.UPDATE_BY_ID })).toEqual(['code', 'deletedAt']);
    expect(toBodyKeys({ route: routes.UPDATE_BY })).toEqual(['code', 'deletedAt', 'where']);
  });

  test('an entity that stamps nothing keeps the audit-named keys writable', () => {
    const routes = buildRoutes({ create: auditedSchema });

    expect(toBodyKeys({ route: routes.CREATE })).toEqual(Object.keys(auditedShape).sort());
    expect(toBodyKeys({ route: routes.UPDATE_BY_ID })).toEqual(
      Object.keys(auditedShape)
        .filter(key => key !== 'id')
        .sort(),
    );
  });

  test('only the keys the entity reports are dropped', () => {
    const routes = buildRoutes({
      create: auditedSchema,
      serverStampedKeys: ['createdAt', 'modifiedAt'],
    });

    expect(toBodyKeys({ route: routes.CREATE })).toEqual([
      'code',
      'createdBy',
      'deletedAt',
      'id',
      'modifiedBy',
    ]);
  });

  test('a reported key the schema does not declare is ignored', () => {
    const routes = buildRoutes({ create: plainSchema, serverStampedKeys: AUDIT_KEYS });

    expect(toBodyKeys({ route: routes.CREATE })).toEqual(['code', 'id']);
    expect(toBodyKeys({ route: routes.UPDATE_BY_ID })).toEqual(['code']);
  });

  test('a custom request.body replaces the default untouched', () => {
    const routes = buildRoutes({
      create: auditedSchema,
      serverStampedKeys: AUDIT_KEYS,
      routes: {
        create: { request: { body: auditedSchema } },
        updateById: { request: { body: auditedSchema } },
        updateBy: { request: { body: auditedSchema } },
      },
    });

    const bodies = [routes.CREATE, routes.UPDATE_BY_ID, routes.UPDATE_BY].map(route =>
      toBody({ route }),
    );

    expect(bodies).toHaveLength(3);
    for (const body of bodies) {
      expect(body).toBe(auditedSchema);
    }
  });

  test('a key the default body drops is stripped from a request, not refused', () => {
    const routes = buildRoutes({ create: auditedSchema, serverStampedKeys: AUDIT_KEYS });

    expect(
      toBody({ route: routes.CREATE }).parse({
        code: 'THEME',
        createdBy: 999,
        modifiedAt: '2000-01-01',
      }),
    ).toEqual({ code: 'THEME' });
  });
});

describe('the default body is the entity schema itself when nothing is dropped', () => {
  test('a schema with nothing to drop is used by identity', () => {
    const createSchema = z.object({ id: z.string(), code: z.string() });
    const routes = buildRoutes({ create: createSchema, update: plainUpdateSchema });

    expect(toBody({ route: routes.CREATE })).toBe(createSchema);
    expect(toBody({ route: routes.UPDATE_BY_ID })).toBe(plainUpdateSchema);
  });

  test('a refined schema with nothing to drop is used as it is, refinement included', () => {
    const refinedSchema = z.object({ code: z.string() }).refine(value => value.code !== 'RESERVED');
    const routes = buildRoutes({ create: refinedSchema });

    expect(toBody({ route: routes.CREATE })).toBe(refinedSchema);
    expect(toBody({ route: routes.UPDATE_BY_ID })).toBe(refinedSchema);
    expect(toBody({ route: routes.CREATE }).safeParse({ code: 'RESERVED' }).success).toBe(false);
  });

  test('a refined schema that must lose a key points at routes.<route>.request.body', () => {
    const refinedSchema = z
      .object({ code: z.string(), createdAt: z.string().optional() })
      .refine(value => value.code !== 'RESERVED');

    expect(() =>
      buildRoutes({
        create: refinedSchema,
        update: plainUpdateSchema,
        serverStampedKeys: ['createdAt'],
      }),
    ).toThrow(
      '[defineControllerRouteConfigs] Cannot build the default create body | keys to leave out: createdAt | The schema is refined or transformed, so zod cannot remove them | Pass routes.create.request.body',
    );
  });

  test('a custom body on every write route leaves a refined entity schema alone', () => {
    const refinedSchema = z.object(auditedShape).refine(value => value.code !== 'RESERVED');
    const customBody = z.object({ code: z.string() });

    const routes = buildRoutes({
      create: refinedSchema,
      serverStampedKeys: AUDIT_KEYS,
      routes: {
        create: { request: { body: customBody } },
        updateById: { request: { body: customBody } },
        updateBy: { request: { body: customBody } },
      },
    });

    expect(toBody({ route: routes.UPDATE_BY })).toBe(customBody);
  });

  test('a transformed schema is used as it is on create; an update route needs its own body', () => {
    const routes = buildRoutes({
      create: untypedSchemas.transformed,
      update: plainUpdateSchema,
    });

    expect(toBody({ route: routes.CREATE })).toBe(untypedSchemas.transformed);
    expect(() => buildRoutes({ create: plainSchema, update: untypedSchemas.transformed })).toThrow(
      'Pass routes.updateById.request.body',
    );
  });

  test('a named schema keeps its component when nothing is dropped', () => {
    const namedSchema = z.object({ code: z.string() }).openapi('NamedWriteBody');
    const routes = buildRoutes({ create: namedSchema, update: plainUpdateSchema });

    expect(toDocumentedBody({ route: routes.CREATE })).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/NamedWriteBody' } } },
    });
  });

  test('a strict schema stays strict: a key the body drops is refused, not stripped', () => {
    const strictSchema = z.strictObject(auditedShape);
    const routes = buildRoutes({ create: strictSchema, serverStampedKeys: AUDIT_KEYS });
    const body = toBody({ route: routes.CREATE });

    expect(toBodyKeys({ route: routes.CREATE })).toEqual(['code', 'deletedAt', 'id']);
    expect(body.safeParse({ code: 'THEME', createdBy: 999 }).error?.issues).toMatchObject([
      { code: 'unrecognized_keys', keys: ['createdBy'] },
    ]);
  });
});

const variantSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  modifiedAt: z.number().optional(),
});

/** Held untyped so the generic abstract `getSchema` returns it without a cast. */
const entitySchemas: Record<string, AnyType> = { variant: variantSchema };

/** Stamps nothing - the engine-neutral default a search collection keeps. */
class VariantDocument extends AbstractEntity<typeof variantSchema> {
  constructor() {
    super({ name: VariantDocument.name });
  }

  getSchema<T>(): T {
    return entitySchemas.variant;
  }
}

/** Reports the two timestamps, as a relational entity with the timestamp enricher does. */
class StampedVariantDocument extends VariantDocument {
  override getServerStampedKeys(): string[] {
    return ['createdAt', 'modifiedAt'];
  }
}

/** Records what the create route hands over. */
class RecordingRepository {
  readonly created: object[] = [];

  async create(opts: { data: object }) {
    this.created.push(opts.data);
    return { count: 1, data: opts.data };
  }
}

const resolveVariantController = (opts: {
  entity: typeof VariantDocument;
  controllerName: string;
}) => {
  const { entity, controllerName } = opts;
  const repositoryName = `${controllerName}Repository`;
  const VariantController = ControllerFactory.defineCrudController({
    entity,
    repository: { name: repositoryName },
    controller: { name: controllerName, basePath: '/variants' },
  });

  const repository = new RecordingRepository();
  const container = new Container();
  container
    .bind({
      key: BindingKeys.build({ namespace: BindingNamespaces.REPOSITORY, key: repositoryName }),
    })
    .toValue(repository);

  return { controller: container.resolve(VariantController), repository };
};

const toRouteBodySchemas = async (opts: {
  controller: ReturnType<typeof resolveVariantController>['controller'];
}) => {
  const router = await opts.controller.configure();
  const document = router.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'crud-write-body-entity', version: '1' },
  });

  return {
    router,
    create: document.paths?.['/']?.post?.requestBody,
    updateById: document.paths?.['/{id}']?.patch?.requestBody,
  };
};

describe('defineCrudController asks the entity which keys it stamps', () => {
  test('the engine-neutral entity stamps nothing', () => {
    expect(new VariantDocument().getServerStampedKeys()).toEqual([]);
  });

  test('an entity that stamps nothing keeps a required createdAt in POST, and it reaches the repository', async () => {
    const { controller, repository } = resolveVariantController({
      entity: VariantDocument,
      controllerName: 'VariantController',
    });
    const { router, create, updateById } = await toRouteBodySchemas({ controller });

    expect(create).toMatchObject({
      content: {
        'application/json': { schema: { required: ['id', 'name', 'createdAt'] } },
      },
    });
    expect(updateById).toMatchObject({
      content: {
        'application/json': {
          schema: { properties: { createdAt: {}, modifiedAt: {} } },
        },
      },
    });

    const document = { id: 'v1', name: 'Coffee', createdAt: 1758600000000 };
    const response = await router.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(document),
    });

    expect(response.status).toBe(201);
    expect(repository.created).toEqual([document]);
  });

  test('an entity that reports keys loses exactly those from POST and PATCH', async () => {
    const { controller } = resolveVariantController({
      entity: StampedVariantDocument,
      controllerName: 'StampedVariantController',
    });
    const { create, updateById } = await toRouteBodySchemas({ controller });

    expect(create).toMatchObject({
      content: { 'application/json': { schema: { required: ['id', 'name'] } } },
    });
    expect(create).not.toMatchObject({
      content: { 'application/json': { schema: { properties: { createdAt: {} } } } },
    });
    expect(updateById).not.toMatchObject({
      content: { 'application/json': { schema: { properties: { modifiedAt: {} } } } },
    });
  });
});
