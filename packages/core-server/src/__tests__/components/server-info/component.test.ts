import 'reflect-metadata';
import { BaseApplication } from '@/base/applications';
import type { IApplicationConfigs, IApplicationInfo } from '@venizia/ignis-kernel';
import { ControllerTransports } from '@venizia/ignis-kernel';
import { AppErrorMiddleware } from '@/base/middlewares';
import {
  ServerInfoBindingKeys,
  ServerInfoComponent,
  ServerInfoReporter,
  type IServerInfoOptions,
  type IServerTime,
} from '@/components/server-info';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { HTTP, type AnyType, type ValueOrPromise } from '@venizia/ignis-helpers/common';
import { describe, expect, test } from 'bun:test';

const TEST_CONFIGS: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 0,
  path: { base: '/', isStrict: false },
  transports: [ControllerTransports.REST],
};

class TestApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'test-app', version: '9.9.9', description: 'Server info test app' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

/** Boots an application with the ServerInfoComponent and nothing else: no auth component, no middleware that could add a header. */
const bootServerInfoApplication = async (opts?: {
  options?: Partial<IServerInfoOptions>;
}): Promise<OpenAPIHono> => {
  const application = new TestApplication({ scope: 'ServerInfoTestApp', config: TEST_CONFIGS });
  application.init();

  if (opts?.options) {
    application
      .bind<IServerInfoOptions>({ key: ServerInfoBindingKeys.SERVER_INFO_OPTIONS })
      .toValue(opts.options as IServerInfoOptions);
  }

  const component = new ServerInfoComponent(application);
  await component.configure();
  await application['registerControllers']();

  const server = application.getServer() as OpenAPIHono;
  server.onError(new AppErrorMiddleware({ logger: application.logger }).value());
  server.route(TEST_CONFIGS.path.base, application.getRootRouter());

  return server;
};

/** Offset text `+07:00` / `-03:30` back to minutes east of UTC, computed apart from the reporter. */
const parseOffsetMinutes = (offset: string): number => {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hh, mm] = offset.slice(1).split(':').map(Number);

  return sign * (hh * 60 + mm);
};

describe('ServerInfoComponent — GET /server/info/time', () => {
  test('answers with the documented shape, typed, and nothing else', async () => {
    const router = await bootServerInfoApplication();

    const before = Date.now();
    const response = await router.request('/server/info/time');
    const after = Date.now();

    expect(response.status).toBe(200);
    const json = await response.json();
    const body = json as Record<string, AnyType>;

    expect(Object.keys(body).sort()).toEqual(['server', 'tz', 'utc']);
    expect(Object.keys(body.server).sort()).toEqual(['date', 'epoch', 'iso', 'time']);
    expect(Object.keys(body.utc).sort()).toEqual(['iso', 'minutes', 'offset']);

    expect(body.server.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.server.time).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(Number.isInteger(body.server.epoch)).toBe(true);
    expect(body.server.epoch).toBeGreaterThanOrEqual(before);
    expect(body.server.epoch).toBeLessThanOrEqual(after);
    expect(body.server.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(typeof body.tz).toBe('string');
    expect(body.tz.length).toBeGreaterThan(0);
    expect(body.utc.offset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(Number.isInteger(body.utc.minutes)).toBe(true);
    expect(body.utc.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('every field describes one instant: the local ISO and the UTC ISO both parse to the epoch', async () => {
    const router = await bootServerInfoApplication();

    const response = await router.request('/server/info/time');
    const json = await response.json();
    const body = json as IServerTime;

    expect(Date.parse(body.server.iso)).toBe(body.server.epoch);
    expect(body.utc.iso).toBe(new Date(body.server.epoch).toISOString());
    expect(body.server.iso).toBe(`${body.server.date}T${body.server.time}${body.utc.offset}`);
    expect(parseOffsetMinutes(body.utc.offset)).toBe(body.utc.minutes);
  });

  test('follows the process time zone, read at request time (TZ set to a negative-offset zone)', async () => {
    const router = await bootServerInfoApplication();
    const previous = process.env.TZ;

    try {
      process.env.TZ = 'America/New_York';
      const response = await router.request('/server/info/time');
      const json = await response.json();
      const body = json as IServerTime;

      expect(body.tz).toBe('America/New_York');
      // EST or EDT depending on the day the suite runs; never positive.
      expect([-300, -240]).toContain(body.utc.minutes);
      expect(['-05:00', '-04:00']).toContain(body.utc.offset);
      expect(Date.parse(body.server.iso)).toBe(body.server.epoch);
    } finally {
      if (previous === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previous;
      }
    }
  });

  test('sends Cache-Control: no-store so no cache or service worker serves a stale time', async () => {
    const router = await bootServerInfoApplication();

    const response = await router.request('/server/info/time');

    expect(response.headers.get(HTTP.Headers.CACHE_CONTROL)).toBe('no-store');
  });

  test('needs no authentication: no credentials and an unrelated Authorization header both get 200', async () => {
    const router = await bootServerInfoApplication();

    const anonymous = await router.request('/server/info/time');
    expect(anonymous.status).toBe(200);

    const garbage = await router.request('/server/info/time', {
      headers: { authorization: 'Bearer not-a-token' },
    });
    expect(garbage.status).toBe(200);
  });

  test('publishes nothing about the build or the host', async () => {
    const router = await bootServerInfoApplication();

    const response = await router.request('/server/info/time');
    const text = await response.text();

    expect(text).not.toContain('9.9.9');
    expect(text).not.toContain('test-app');
    expect(text).not.toContain(String(process.pid));
  });

  test('custom rest path is honoured and the default path is gone', async () => {
    const router = await bootServerInfoApplication({
      options: { restOptions: { path: '/clock' } },
    });

    const custom = await router.request('/clock/time');
    const fallback = await router.request('/server/info/time');

    expect(custom.status).toBe(200);
    expect(fallback.status).toBe(404);
  });

  test('an empty options binding falls back to the default path instead of crashing at boot', async () => {
    const router = await bootServerInfoApplication({ options: {} });

    const response = await router.request('/server/info/time');

    expect(response.status).toBe(200);
  });

  test('a partial restOptions binding falls back to the default path instead of crashing at boot', async () => {
    const router = await bootServerInfoApplication({ options: { restOptions: {} as AnyType } });

    const response = await router.request('/server/info/time');

    expect(response.status).toBe(200);
  });
});

describe('ServerInfoReporter.buildTime', () => {
  /** 2026-11-10T08:00:00.123Z, worked out by hand and checked with `Date.parse`. */
  const EPOCH = 1794297600123;

  test.each([
    {
      tz: 'Asia/Ho_Chi_Minh',
      date: '2026-11-10',
      time: '15:00:00.123',
      offset: '+07:00',
      minutes: 420,
    },
    { tz: 'UTC', date: '2026-11-10', time: '08:00:00.123', offset: '+00:00', minutes: 0 },
    {
      tz: 'Asia/Kolkata',
      date: '2026-11-10',
      time: '13:30:00.123',
      offset: '+05:30',
      minutes: 330,
    },
    // November 10 is after the US DST change (November 1), so New York is on EST.
    {
      tz: 'America/New_York',
      date: '2026-11-10',
      time: '03:00:00.123',
      offset: '-05:00',
      minutes: -300,
    },
    {
      tz: 'America/St_Johns',
      date: '2026-11-10',
      time: '04:30:00.123',
      offset: '-03:30',
      minutes: -210,
    },
  ])('$tz at the fixed instant', ({ tz, date, time, offset, minutes }) => {
    const result = ServerInfoReporter.buildTime({ now: new Date(EPOCH), timeZone: tz });

    expect(result).toEqual({
      server: { date, time, epoch: EPOCH, iso: `${date}T${time}${offset}` },
      tz,
      utc: { offset, minutes, iso: '2026-11-10T08:00:00.123Z' },
    });
  });

  test('date and time round-trip to the epoch through the offset', () => {
    for (const tz of ['Asia/Ho_Chi_Minh', 'America/New_York', 'Asia/Kolkata', 'America/St_Johns']) {
      const result = ServerInfoReporter.buildTime({ now: new Date(EPOCH), timeZone: tz });
      const { date, time } = result.server;

      expect(Date.parse(`${date}T${time}${result.utc.offset}`)).toBe(EPOCH);
      expect(result.utc.iso).toBe(new Date(EPOCH).toISOString());
      expect(parseOffsetMinutes(result.utc.offset)).toBe(result.utc.minutes);
      expect(Math.sign(result.utc.minutes)).toBe(Math.sign(parseOffsetMinutes(result.utc.offset)));
    }
  });

  test('the local date moves ahead of the UTC date when the zone is east of it', () => {
    // 2026-11-10T20:00:00.000Z is already the 11th in Ho Chi Minh.
    const result = ServerInfoReporter.buildTime({
      now: new Date(1794340800000),
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(result.server.date).toBe('2026-11-11');
    expect(result.server.time).toBe('03:00:00.000');
    expect(result.utc.iso).toBe('2026-11-10T20:00:00.000Z');
  });

  test('local midnight prints 00, never 24', () => {
    // 2026-11-09T17:00:00.000Z is 2026-11-10 00:00 in Ho Chi Minh.
    const result = ServerInfoReporter.buildTime({
      now: new Date(1794243600000),
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    expect(result.server.date).toBe('2026-11-10');
    expect(result.server.time).toBe('00:00:00.000');
  });

  test('the offset is read at the instant, so daylight saving time moves it', () => {
    // 2026-07-01T12:00:00.000Z: New York is on EDT (-04:00), not the EST of November.
    const result = ServerInfoReporter.buildTime({
      now: new Date(1782907200000),
      timeZone: 'America/New_York',
    });

    expect(result.utc.offset).toBe('-04:00');
    expect(result.utc.minutes).toBe(-240);
    expect(result.server.time).toBe('08:00:00.000');
  });

  test('without arguments it reads the process time zone and the clock', () => {
    const before = Date.now();
    const result = ServerInfoReporter.buildTime();
    const after = Date.now();

    expect(result.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(result.server.epoch).toBeGreaterThanOrEqual(before);
    expect(result.server.epoch).toBeLessThanOrEqual(after);
  });
});
