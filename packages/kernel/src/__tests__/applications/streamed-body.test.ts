import { BodyLimits } from '@/base/applications';
import { Hono } from 'hono';
import { describe, expect, test } from 'bun:test';

/** An application with the limit of every route, one route that streams its body and one that does not. */
const build = () => {
  const application = new Hono();
  const limiter = BodyLimits.limiter({ maxSize: 4, onError: (context) => context.text('', 413) });

  application.use('*', (context, next) => {
    return BodyLimits.hasRouteLimit(context) ? next() : limiter(context, next);
  });
  application.post('/stream', BodyLimits.stream(), async (context) => {
    const received = await context.req.raw.arrayBuffer();
    const size = received.byteLength;

    return context.json({ size, isStreamed: BodyLimits.isStreamed(context) });
  });
  application.post('/own', BodyLimits.route({ maxSize: 8 }), (context) => {
    return context.json({ isStreamed: BodyLimits.isStreamed(context) });
  });

  return application;
};

const post = (path: string) => build().request(path, { method: 'POST', body: '123456' });

describe('BodyLimits.stream', () => {
  test('the limit of every route steps aside for a streamed route', async () => {
    const response = await post('/stream');
    const body = await response.json();

    expect(body).toEqual({ size: 6, isStreamed: true });
  });

  test('a route with its own limit is not a streamed one', async () => {
    const response = await post('/own');
    const body = await response.json();

    expect(body).toEqual({ isStreamed: false });
  });
});
