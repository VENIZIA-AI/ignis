import { RestApplication } from '@/base/applications/rest';
import type { IApplicationConfigs, IApplicationInfo } from '@/base/applications/common';
import { service } from '@/base/metadata';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { beforeEach, describe, expect, test } from 'bun:test';

class ReportingApplication extends RestApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'unresolved-bindings-app', version: '0.0.0', description: '' };
  }
  preConfigure(): void {}
  postConfigure(): void {}
  staticConfigure(): void {}
  setupMiddlewares(): void {}
}

@service()
class ReadService {}

@service()
class NeverReadService {}

describe('getUnresolvedBindings', () => {
  let application: ReportingApplication;

  beforeEach(async () => {
    application = new ReportingApplication({
      scope: 'ReportingApplication',
      config: { path: { base: '/', isStrict: false } } as IApplicationConfigs,
    });
    application.init();

    await application.registerArtifacts({ services: [ReadService, NeverReadService] });
    application.startResolutionCounting();
  });

  test('it names the service nobody read, and only that one', () => {
    application.get({ key: 'services.ReadService' });

    expect(application.getUnresolvedBindings()).toEqual(['services.NeverReadService']);
  });

  test('with nothing read, every service in the namespace is unresolved', () => {
    expect(application.getUnresolvedBindings().sort()).toEqual([
      'services.NeverReadService',
      'services.ReadService',
    ]);
  });

  test('a tag nothing carries answers empty, not everything', () => {
    expect(application.getUnresolvedBindings({ tags: ['controllers'] })).toEqual([]);
  });

  /**
   * Starting again is the reset. `doVerify` reads every service and repository at boot, so a report
   * taken over boot's own resolutions is empty for the wrong reason.
   */
  test('reading a service fills a count that starting again clears', () => {
    application.get({ key: 'services.ReadService' });
    expect(application.getResolutionCounts().get('services.ReadService')).toBe(1);

    application.startResolutionCounting();

    expect(application.getUnresolvedBindings().sort()).toEqual([
      'services.NeverReadService',
      'services.ReadService',
    ]);
  });

  /** A wrong list is worse than no list: without counting, every binding looks unresolved. */
  test('reading the report without starting is refused, by name', () => {
    const fresh = new ReportingApplication({
      scope: 'NeverCounted',
      config: { path: { base: '/', isStrict: false } } as IApplicationConfigs,
    });
    fresh.init();

    expect(() => fresh.getUnresolvedBindings()).toThrow(/startResolutionCounting/);
  });
});
