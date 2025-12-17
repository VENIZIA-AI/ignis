import { TestApplication } from '@/__tests__/fixtures/application';
import { BaseBootstrapper } from '@/base';
import { IBootableApplication, IBootstrapper } from '@/common/types';
import { describe, expect, test } from 'bun:test';

describe('Base Bootstrapper Tests', () => {
  let application: IBootableApplication;
  let bootstrapper: IBootstrapper;

  application = new TestApplication({ bootOptions: {} });
  bootstrapper = new BaseBootstrapper({ application, scope: BaseBootstrapper.name });

  describe('boot', () => {
    test('should run boot process and return report', async () => {
      await bootstrapper.boot({});

      expect(
        application.get({ key: 'repositories.Model1Repository', isOptional: true }),
      ).toBeDefined();
      expect(
        application.get({ key: 'repositories.Model2Repository', isOptional: true }),
      ).toBeDefined();
    });
  });
});
