import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';

/**
 * Hono ALREADY percent-decodes a path param before the handler sees it (`%25` -> `%`, `%2F` -> `/`).
 * Decoding it a second time in the controller is not a safety net, it is a bug:
 *
 *   - `report_100%.pdf` is a legal object name and passes `isValidName`. The component's own link
 *     builder hands the client `.../objects/report_100%25.pdf`; Hono decodes that back to
 *     `report_100%.pdf`; a second `decodeURIComponent` then hits the invalid escape `%.p` and
 *     throws - so the object can never be fetched, downloaded or deleted. A 400 forever.
 *   - an object literally named `a%2Fb.png` decodes twice into `a/b.png` - a DIFFERENT object. GET
 *     and DELETE would silently address the wrong one.
 *
 * This test pins Hono's behaviour, which is the fact the controller must be built on.
 */
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
