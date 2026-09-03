import { describe, expect, test } from 'bun:test';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

import { FilterSchema, InclusionSchema, LimitSchema } from '@venizia/ignis-kernel';

/** The schemas are built in `@venizia/ignis-filter` with plain `zod` and decorated here, so this failure mode is silent: if the decorator never runs, everything still compiles and every request still validates - the API documentation just quietly loses every description. Assert against a generated document rather than a schema's internals, which is where the metadata actually has to end up. */
/** The nested assertions are the point of the builder. `.openapi()` returns a NEW schema instead of mutating, so a consumer cannot annotate `relation` or `scope` after `InclusionSchema` is composed - the composed node would still hold the undecorated children. If these three ever go undefined while the top-level ones pass, the decorator stopped reaching inner nodes. */

const toDocument = (application: OpenAPIHono): Record<string, any> => {
  return application.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'query-schema-probe', version: '1' },
  }) as Record<string, any>;
};

const documentForQuery = (schema: ReturnType<typeof z.object>): Record<string, any> => {
  const application = new OpenAPIHono();

  application.openapi(
    createRoute({
      method: 'get',
      path: '/probe',
      request: { query: schema },
      responses: { 200: { description: 'ok' } },
    }),
    context => context.json({}),
  );

  return toDocument(application);
};

const documentForBody = (schema: ReturnType<typeof z.object>): Record<string, any> => {
  const application = new OpenAPIHono();

  application.openapi(
    createRoute({
      method: 'post',
      path: '/probe',
      request: { body: { content: { 'application/json': { schema } } } },
      responses: { 200: { description: 'ok' } },
    }),
    context => context.json({}),
  );

  return toDocument(application);
};

describe('the query schemas reach OpenAPI with their documentation intact', () => {
  test('top-level parameters carry their descriptions', () => {
    const document = documentForQuery(z.object({ filter: FilterSchema, limit: LimitSchema }));
    const parameters = document.paths['/probe'].get.parameters as Array<Record<string, any>>;
    const describedBy = (name: string) =>
      parameters.find(parameter => parameter.name === name)?.schema?.description;

    expect(describedBy('limit')).toBe(
      'Maximum number of items to return. Defaults to 10 for top-level list queries.',
    );
    expect(describedBy('filter')).toContain('A comprehensive filter object for querying data');
  });

  test('nested properties carry theirs too, which decorating after composition cannot do', () => {
    const document = documentForBody(z.object({ include: InclusionSchema }));
    const include =
      document.paths['/probe'].post.requestBody.content['application/json'].schema.properties
        .include;
    const item = include.items ?? include.anyOf?.[0]?.items;

    expect(include.description).toBe('Define related models to include in the response.');
    expect(item.properties.relation.description).toBe('Model relation name');
    expect(item.properties.scope.description).toBe('Model relation filter');
  });

  /**
   * `shouldSkipDefaultFilter` is a SERVER-side option and must never be on the wire schema: a
   * client that could send it would have the relation emitted with no where clause, erasing the
   * `@model` defaultFilter that implements soft-delete and the static visibility scopes.
   */
  test('the inclusion schema does not expose shouldSkipDefaultFilter to callers', () => {
    const document = documentForBody(z.object({ include: InclusionSchema }));
    const include =
      document.paths['/probe'].post.requestBody.content['application/json'].schema.properties
        .include;
    const item = include.items ?? include.anyOf?.[0]?.items;

    expect(item.properties.shouldSkipDefaultFilter).toBeUndefined();
  });
});
