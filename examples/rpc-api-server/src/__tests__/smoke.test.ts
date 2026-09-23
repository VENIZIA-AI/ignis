// Smoke test: boots the real application on a free port with an in-memory database, signs up and
// signs in over HTTP, then calls the protected CRUD routes and a JSX page.
import { z } from '@hono/zod-openapi';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Application } from '../application';

const HOST = '127.0.0.1';

const SignUpResponse = z.object({ id: z.uuid({ version: 'v7' }), username: z.string() });
const SignInResponse = z.object({ token: z.jwt() });
const ConfigurationResponse = z.object({
  data: z.object({
    id: z.uuid({ version: 'v7' }),
    code: z.string(),
    group: z.string(),
    createdBy: z.string().nullable(),
  }),
});

describe('rpc-api-server', () => {
  let application: Application;
  let baseUrl = '';
  let userId = '';
  let token = '';
  let configurationId = '';

  const request = (opts: { method: string; path: string; body?: object; token?: string }) =>
    fetch(`${baseUrl}${opts.path}`, {
      method: opts.method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

  beforeAll(async () => {
    // Unset means an in-memory database, so the test never touches app_data/.
    delete process.env.APP_ENV_PGLITE_DATA_DIR;
    process.env.APP_ENV_JWT_SECRET = 'smoke-test-secret-not-for-production';

    application = new Application({
      scope: 'SmokeTest',
      config: {
        host: HOST,
        port: 0,
        path: { base: '/api', isStrict: false },
        discoverArtifacts: true,
      },
    });
    application.init();
    await application.start();

    baseUrl = `http://${HOST}:${application.getServerPort()}/api`;
  });

  afterAll(async () => {
    await application.stop();
  });

  test('GET /health answers', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  test('POST /auth/sign-up creates a user', async () => {
    const response = await request({
      method: 'POST',
      path: '/auth/sign-up',
      body: { username: 'smoke_user', credential: 'smoke-password' },
    });
    expect(response.status).toBe(200);

    const user = SignUpResponse.parse(await response.json());
    expect(user.username).toBe('smoke_user');
    userId = user.id;
  });

  test('POST /auth/sign-in returns a JWT', async () => {
    const response = await request({
      method: 'POST',
      path: '/auth/sign-in',
      body: {
        identifier: { scheme: 'username', value: 'smoke_user' },
        credential: { scheme: 'basic', value: 'smoke-password' },
      },
    });
    expect(response.status).toBe(200);
    token = SignInResponse.parse(await response.json()).token;
  });

  test('POST /auth/sign-in rejects a wrong password', async () => {
    const response = await request({
      method: 'POST',
      path: '/auth/sign-in',
      body: {
        identifier: { scheme: 'username', value: 'smoke_user' },
        credential: { scheme: 'basic', value: 'wrong-password' },
      },
    });
    expect(response.status).toBe(401);
  });

  test('GET /configurations without a token is 401', async () => {
    const response = await request({ method: 'GET', path: '/configurations' });
    expect(response.status).toBe(401);
  });

  test('POST /configurations stamps the signed-in user as createdBy', async () => {
    const response = await request({
      method: 'POST',
      path: '/configurations',
      token,
      body: { code: 'THEME', group: 'UI', description: 'Default theme' },
    });
    expect(response.status).toBe(201);

    const { data } = ConfigurationResponse.parse(await response.json());
    expect(data.createdBy).toBe(userId);
    configurationId = data.id;
  });

  test('PATCH then GET /configurations/:id round-trips the change', async () => {
    const updated = await request({
      method: 'PATCH',
      path: `/configurations/${configurationId}`,
      token,
      body: { group: 'APPEARANCE' },
    });
    expect(updated.status).toBe(200);

    const response = await request({
      method: 'GET',
      path: `/configurations/${configurationId}`,
      token,
    });
    expect(response.status).toBe(200);
    expect(ConfigurationResponse.parse(await response.json()).data.group).toBe('APPEARANCE');
  });

  test('DELETE /configurations/:id removes it', async () => {
    const deleted = await request({
      method: 'DELETE',
      path: `/configurations/${configurationId}`,
      token,
    });
    expect(deleted.status).toBe(200);

    // A missing id is not an error: the read answers 200 with an empty envelope.
    const response = await request({
      method: 'GET',
      path: `/configurations/${configurationId}`,
      token,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 0, data: null });
  });

  test('GET / renders the JSX home page', async () => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('<h1>');
  });

  test('GET /doc/openapi.json describes the auth and CRUD routes', async () => {
    const response = await fetch(`${baseUrl}/doc/openapi.json`);
    expect(response.status).toBe(200);

    const { paths } = z
      .object({ paths: z.record(z.string(), z.unknown()) })
      .parse(await response.json());
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining(['/auth/sign-in', '/auth/sign-up', '/configurations']),
    );
  });
});
