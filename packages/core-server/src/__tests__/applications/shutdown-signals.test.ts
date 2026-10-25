import 'reflect-metadata';

import { BaseApplication } from '@/base/applications';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import type { IApplicationInfo } from '@venizia/ignis-kernel';
import { afterEach, describe, expect, test } from 'bun:test';

/** SIGUSR2 and SIGUSR1: signals no test runner or the default install claims, safe to emit on `process`. */
const SIGNAL = 'SIGUSR2';
const OTHER_SIGNAL = 'SIGUSR1';

class ShutdownApplication extends BaseApplication {
  stopCalls = 0;
  stopImplementation: () => Promise<void> = async () => {};

  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'shutdown-app', version: '0.0.0', description: 'Shutdown signals probe' };
  }

  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}

  override async stop(): Promise<void> {
    this.stopCalls += 1;
    await this.stopImplementation();
  }
}

const build = () => {
  const application = new ShutdownApplication({
    scope: ShutdownApplication.name,
    config: { host: '127.0.0.1', port: 0, path: { base: '/', isStrict: true } },
  });
  application.init();
  return application;
};

const uninstallers: Array<() => void> = [];
afterEach(() => {
  while (uninstallers.length > 0) {
    uninstallers.pop()?.();
  }
});

const install = (application: ShutdownApplication, exits: number[], extra = {}) => {
  const uninstall = application.installShutdownSignals({
    signals: [SIGNAL],
    exit: (code) => exits.push(code),
    ...extra,
  });
  uninstallers.push(uninstall);
  return uninstall;
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

describe('ServerApplication.installShutdownSignals', () => {
  test('a signal calls stop() once and then exits 0', async () => {
    const application = build();
    const exits: number[] = [];
    install(application, exits);

    process.emit(SIGNAL);
    await settle();

    expect(application.stopCalls).toBe(1);
    expect(exits).toEqual([0]);
  });

  test('a second signal while stopping is ignored: stop() still runs once', async () => {
    const application = build();
    const exits: number[] = [];
    let release: () => void = () => {};
    application.stopImplementation = () => new Promise<void>((resolve) => (release = resolve));
    install(application, exits);

    process.emit(SIGNAL);
    process.emit(SIGNAL);
    await settle();
    expect(application.stopCalls).toBe(1);
    expect(exits).toEqual([]);

    release();
    await settle();
    expect(exits).toEqual([0]);
  });

  test('a stop() that throws exits 1', async () => {
    const application = build();
    const exits: number[] = [];
    application.stopImplementation = async () => {
      throw new Error('pool refused to end');
    };
    install(application, exits);

    process.emit(SIGNAL);
    await settle();

    expect(exits).toEqual([1]);
  });

  test('a stop() that does not finish within timeoutMs is force-exited with 1', async () => {
    const application = build();
    const exits: number[] = [];
    application.stopImplementation = () => new Promise<void>(() => {});
    install(application, exits, { timeoutMs: 30 });

    process.emit(SIGNAL);
    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    expect(exits).toEqual([1]);
  });

  test('a stop() that finishes in time cancels the timeout: exit runs once', async () => {
    const application = build();
    const exits: number[] = [];
    install(application, exits, { timeoutMs: 40 });

    process.emit(SIGNAL);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(exits).toEqual([0]);
  });

  test('calling it twice returns the same uninstall and adds no second listener', () => {
    const application = build();
    const before = process.listenerCount(SIGNAL);

    const first = install(application, []);
    const second = application.installShutdownSignals({ signals: [OTHER_SIGNAL] });

    expect(second).toBe(first);
    expect(process.listenerCount(SIGNAL)).toBe(before + 1);
    expect(process.listenerCount(OTHER_SIGNAL)).toBe(0);
  });

  test('uninstall removes the listeners, so a later signal does nothing, and it can be installed again', async () => {
    const application = build();
    const exits: number[] = [];
    const before = process.listenerCount(SIGNAL);
    const uninstall = install(application, exits);

    uninstall();
    expect(process.listenerCount(SIGNAL)).toBe(before);

    process.emit(SIGNAL);
    await settle();
    expect(application.stopCalls).toBe(0);

    install(application, exits);
    process.emit(SIGNAL);
    await settle();
    expect(application.stopCalls).toBe(1);
  });

  test('uninstall during a shutdown cancels the pending timeout', async () => {
    const application = build();
    const exits: number[] = [];
    application.stopImplementation = () => new Promise<void>(() => {});
    const uninstall = install(application, exits, { timeoutMs: 30 });

    process.emit(SIGNAL);
    uninstall();
    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    expect(exits).toEqual([]);
  });

  test('the default signals are SIGTERM and SIGINT', () => {
    const application = build();
    const termBefore = process.listenerCount('SIGTERM');
    const intBefore = process.listenerCount('SIGINT');

    const uninstall = application.installShutdownSignals({ exit: () => {} });
    expect(process.listenerCount('SIGTERM')).toBe(termBefore + 1);
    expect(process.listenerCount('SIGINT')).toBe(intBefore + 1);

    uninstall();
    expect(process.listenerCount('SIGTERM')).toBe(termBefore);
    expect(process.listenerCount('SIGINT')).toBe(intBefore);
  });

  test.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'timeoutMs %p is refused and installs nothing',
    (timeoutMs) => {
      const application = build();
      const before = process.listenerCount(SIGNAL);

      expect(() => application.installShutdownSignals({ signals: [SIGNAL], timeoutMs })).toThrow(
        /timeoutMs/,
      );
      expect(process.listenerCount(SIGNAL)).toBe(before);
    },
  );

  test('nothing is installed until it is called', () => {
    build();

    expect(process.listenerCount(SIGNAL)).toBe(0);
  });
});
