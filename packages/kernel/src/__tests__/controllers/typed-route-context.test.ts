// What `req.valid()` answers, by route config. The typecheck is the test of the types; the run checks one typed route.
import { BaseRestController } from '@/base/controllers';
import type {
  IAuthRouteConfig,
  TContextOf,
  TRouteContext,
  TRouteHandler,
} from '@/base/controllers';
import { OpenApiResponses } from '@/base/models';
import { z } from '@hono/zod-openapi';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { Context, Env, MiddlewareHandler } from 'hono';
import { describe, expect, test } from 'bun:test';

type TSame<Left, Right> =
  (<Probe>() => Probe extends Left ? 1 : 2) extends <Probe>() => Probe extends Right ? 1 : 2
    ? true
    : false;

const check = <Holds extends true>(): Holds | undefined => undefined;

const responses = OpenApiResponses.jsonResponse({ schema: z.object({ name: z.string() }) });

const CREATE = {
  method: 'post',
  path: '/{id}',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ page: z.coerce.number() }),
    headers: z.object({ 'x-trace': z.string() }),
    cookies: z.object({ session: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ name: z.string() }) } } },
  },
  responses,
} satisfies IAuthRouteConfig;

const UPLOAD = {
  method: 'post',
  path: '/upload',
  request: {
    body: { content: { 'multipart/form-data': { schema: z.object({ title: z.string() }) } } },
  },
  responses,
} satisfies IAuthRouteConfig;

const ENCODED = {
  method: 'post',
  path: '/encoded',
  request: {
    body: {
      content: { 'application/x-www-form-urlencoded': { schema: z.object({ size: z.number() }) } },
    },
  },
  responses,
} satisfies IAuthRouteConfig;

const BARE = { method: 'get', path: '/bare', responses } satisfies IAuthRouteConfig;

const WIDE: IAuthRouteConfig = CREATE;

const typed = (context: TContextOf<typeof CREATE>) => {
  const body = context.req.valid('json');
  const param = context.req.valid('param');
  const query = context.req.valid('query');
  const header = context.req.valid('header');
  const cookie = context.req.valid('cookie');
  const form = context.req.valid('form');
  // eslint-disable-next-line @venizia/typed-route-context -- the migration overload is what this line tests
  const own = context.req.valid<{ legacy: true }>('json');

  check<TSame<typeof body, { name: string }>>();
  check<TSame<typeof param, { id: string }>>();
  check<TSame<typeof query, { page: number }>>();
  check<TSame<typeof header, { 'x-trace': string }>>();
  check<TSame<typeof cookie, { session: string }>>();
  check<TSame<typeof form, unknown>>();
  check<TSame<typeof own, { legacy: true }>>();

  // @ts-expect-error not a target of a request
  context.req.valid('body');
  // @ts-expect-error the schema says `name` is a string
  const wrong: { name: number } = context.req.valid('json');

  return wrong;
};

const forms = (upload: TContextOf<typeof UPLOAD>, encoded: TContextOf<typeof ENCODED>) => {
  const file = upload.req.valid('form');
  const fields = encoded.req.valid('form');
  const json = upload.req.valid('json');

  check<TSame<typeof file, { title: string }>>();
  check<TSame<typeof fields, { size: number }>>();
  check<TSame<typeof json, unknown>>();
};

const untypedParts = (
  bare: TContextOf<typeof BARE>,
  wide: TContextOf<typeof WIDE>,
  plain: TRouteContext,
) => {
  const missing = bare.req.valid('query');
  const widened = wide.req.valid('json');
  const unnamed = plain.req.valid('json');
  const asked = plain.req.valid<{ id: string }>('param');

  check<TSame<typeof missing, unknown>>();
  check<TSame<typeof widened, unknown>>();
  check<TSame<typeof unnamed, unknown>>();
  check<TSame<typeof asked, { id: string }>>();
};

/** A handler typed from its route still goes where a context of no route in particular is asked for. */
const forwarded = (context: TContextOf<typeof CREATE>) => {
  const read = (any: TRouteContext) => any.req.valid<{ name: string }>('json');

  return read(context);
};

/** A route context goes where Hono's own context or middleware is asked for, as an application's helper takes it. */
const handedToHono = (
  context: TContextOf<typeof CREATE>,
  plain: TRouteContext,
  middleware: MiddlewareHandler<Env, string>,
  read: (any: Context<Env, string, {}>) => string,
) => {
  const next = async () => {};

  return [read(context), read(plain), middleware(context, next), middleware(plain, next)];
};

class OrderController extends BaseRestController {
  constructor() {
    super({ scope: OrderController.name, path: '/orders' });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: CREATE,
      handler: (context) => {
        const body = context.req.valid('json');
        check<TSame<typeof body, { name: string }>>();

        return context.json(body);
      },
    });
    this.bindRoute({ configs: UPLOAD }).to({
      handler: (context) => {
        const form = context.req.valid('form');
        check<TSame<typeof form, { title: string }>>();

        return context.json(form);
      },
    });
    // A handler written for no config in particular still registers.
    const shared: TRouteHandler = (context) => context.json({ name: 'shared' });
    this.defineRoute({ configs: BARE, handler: shared });
  }
}

describe('TContextOf', () => {
  test('types a route handler from its config (checked by the typecheck)', async () => {
    const controller = new OrderController();
    const router = await controller.configure();
    const answer = await router.request('/7?page=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-trace': 't', cookie: 'session=s' },
      body: JSON.stringify({ name: 'pen', extra: true }),
    });

    const payload = await answer.json();

    expect(payload).toEqual({ name: 'pen' });
    expect([typed, forms, untypedParts, forwarded, handedToHono]).toHaveLength(5);
  });
});
