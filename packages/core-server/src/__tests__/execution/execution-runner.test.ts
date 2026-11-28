import 'reflect-metadata';

import { BaseApplication, type IApplicationConfigs } from '@/base/applications';
import { ExecutionRunner } from '@/base/execution';
import { useRequestContext } from '@/base/metadata';
import { Execution, ExecutionModes } from '@/helpers';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import { Authentication, RequestContextRegistry } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

/** What the frame of the caller looks like, safe to answer as JSON. */
const describeFrame = () => {
  const frame = Execution.current();
  const context = useRequestContext();

  return {
    mode: frame?.mode ?? null,
    reason: frame?.reason ?? null,
    userId: frame?.userId ?? null,
    path: context?.req.path ?? null,
    isRegistrySame: RequestContextRegistry.resolve() === context,
    captured: ExecutionRunner.capture().userId ?? null,
  };
};

class FrameApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'frame-app', version: '0.0.0', description: 'Execution frames' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  setupMiddlewares(): void {}

  postConfigure(): void {
    const server = this.getServer();

    server.get('/frame', async (context) => {
      context.set(Authentication.AUDIT_USER_ID, Number(context.req.query('user')));
      await Execution.sleep({ ms: Number(context.req.query('wait') ?? 0) });

      return context.json(describeFrame());
    });

    server.get('/nested', async (context) => {
      context.set(Authentication.AUDIT_USER_ID, 3);
      const system = await Execution.run({
        mode: ExecutionModes.SYSTEM,
        reason: 'nested probe',
        task: () => describeFrame(),
      });
      const root = await Execution.run({
        mode: ExecutionModes.SCOPED,
        isRoot: true,
        task: () => describeFrame(),
      });

      return context.json({ system, root, after: describeFrame() });
    });
  }
}

const configs: IApplicationConfigs = {
  host: '127.0.0.1',
  port: 0,
  path: { base: '/', isStrict: false },
};

let application: FrameApplication;
let origin: string;

beforeAll(async () => {
  application = new FrameApplication({ scope: 'FrameApplication', config: configs });
  application.init();
  await application.start();
  origin = `http://127.0.0.1:${application.getServerPort()}`;
});

afterAll(async () => {
  await application.stop();
});

describe('an application started inside a system run', () => {
  test('no code of a request runs in that frame, not even what runs ahead of the other middlewares', async () => {
    const seen: Array<string | undefined> = [];

    class ProbedApplication extends FrameApplication {
      protected override generateRequestId(): string {
        seen.push(Execution.current()?.mode);

        return super.generateRequestId();
      }
    }

    const started = new ProbedApplication({ scope: 'ProbedApplication', config: configs });
    await Execution.run({
      mode: ExecutionModes.SYSTEM,
      reason: 'boot probe',
      task: async () => {
        started.init();
        await started.start();
      },
    });
    await fetch(`http://127.0.0.1:${started.getServerPort()}/frame`);
    await started.stop();

    expect(seen).toEqual([ExecutionModes.SCOPED]);
  });
});

describe('a web request is a frame', () => {
  test('a scoped frame with the request, read by useRequestContext, the registry and capture', async () => {
    const response = await fetch(`${origin}/frame?user=11`);

    const result = await response.json();
    expect(result).toEqual({
      mode: ExecutionModes.SCOPED,
      reason: null,
      userId: null,
      path: '/frame',
      isRegistrySame: true,
      captured: 11,
    });
  });

  test('concurrent requests never read each other', async () => {
    const users = Array.from({ length: 60 }, (_value, index) => index + 1);
    const seen = await Promise.all(
      users.map(async (user) => {
        const response = await fetch(`${origin}/frame?user=${user}&wait=${user % 7}`);
        const body: unknown = await response.json();

        return typeof body === 'object' && body !== null ? Reflect.get(body, 'captured') : body;
      }),
    );

    expect(seen).toEqual(users);
  });

  test('a nested system run keeps the request; a root run drops it; the request frame returns', async () => {
    const response = await fetch(`${origin}/nested`);

    const result2 = await response.json();
    expect(result2).toMatchObject({
      system: { mode: 'system', reason: 'nested probe', path: '/nested', captured: 3 },
      root: { mode: 'scoped', reason: null, path: null, captured: null },
      after: { mode: 'scoped', path: '/nested', captured: 3 },
    });
  });

  test('outside a request there is no frame and no request', () => {
    expect(describeFrame()).toMatchObject({ mode: null, path: null, captured: null });
  });

  test('a run outside a request has a frame and still no request; its user is captured', async () => {
    const frame = await Execution.run({
      mode: ExecutionModes.SCOPED,
      userId: 'job-user',
      task: () => describeFrame(),
    });

    expect(frame).toMatchObject({ mode: 'scoped', path: null, captured: 'job-user' });
  });
});
