// Smoke test: boots the real application on a free port and calls its REST route with `fetch`
// and its gRPC method through a ConnectRPC client over HTTP.
import { z } from '@hono/zod-openapi';
import { create } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ControllerTransports } from '@venizia/ignis';
import { Application } from '../application';
import { GreeterService, SayHelloRequestSchema } from '../controllers/greeter/definition';

const HOST = '127.0.0.1';

const StatusResponse = z.object({ status: z.string(), uptime: z.number() });

describe('grpc-test', () => {
  let application: Application;
  let baseUrl = '';

  beforeAll(async () => {
    application = new Application({
      scope: 'SmokeTest',
      config: {
        host: HOST,
        port: 0,
        path: { base: '/api', isStrict: false },
        discoverArtifacts: true,
        transports: [ControllerTransports.REST, ControllerTransports.GRPC],
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

  test('GET /status answers with uptime', async () => {
    const response = await fetch(`${baseUrl}/status`);
    expect(response.status).toBe(200);

    const body = StatusResponse.parse(await response.json());
    expect(body.status).toBe('ok');
  });

  test('GreeterService.SayHello answers over ConnectRPC', async () => {
    const transport = createConnectTransport({ baseUrl: `${baseUrl}/grpc` });
    const client = createClient(GreeterService, transport);

    const response = await client.sayHello(create(SayHelloRequestSchema, { name: 'Ignis' }));
    expect(response.message).toBe('Hello, Ignis!');
  });

  test('GET /doc/openapi.json serves the API description', async () => {
    const response = await fetch(`${baseUrl}/doc/openapi.json`);
    expect(response.status).toBe(200);
  });
});
