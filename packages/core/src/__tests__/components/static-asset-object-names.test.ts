import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';

/** Hono ALREADY percent-decodes a path param before the handler sees it, so a second decode is a bug: `report_100%.pdf` comes back as the invalid escape `%.p` and 400s forever, and an object named `a%2Fb.png` decodes twice into `a/b.png` - a DIFFERENT object that GET and DELETE would silently address. */
const buildServer = () => {
  const app = new Hono();
  app.get('/objects/:objectName', context => {
    return context.json({ objectName: context.req.param('objectName') });
  });

  return app;
};

const fetchObjectName = async (rawName: string): Promise<string> => {
  const response = await buildServer().request(`/objects/${encodeURIComponent(rawName)}`);
  const body = (await response.json()) as { objectName: string };

  return body.objectName;
};

describe('Hono decodes the path param - the controller must NOT decode again', () => {
  test('a name containing a percent sign survives intact', async () => {
    expect(await fetchObjectName('report_100%.pdf')).toBe('report_100%.pdf');
  });

  test('a nested path survives intact', async () => {
    expect(await fetchObjectName('tenant-7/avatar.png')).toBe('tenant-7/avatar.png');
  });

  test('a name that LOOKS like an encoded slash stays literal - it is not a folder', async () => {
    // Decoding a second time would turn this into `a/b.png`, a different object entirely.
    expect(await fetchObjectName('a%2Fb.png')).toBe('a%2Fb.png');
  });

  test('a name with a space and a plus survives intact', async () => {
    expect(await fetchObjectName('my report+final.pdf')).toBe('my report+final.pdf');
  });
});
