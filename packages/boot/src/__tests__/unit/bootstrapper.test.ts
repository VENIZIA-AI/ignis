import { TestApplication } from '@/__tests__/fixtures/application';
import { Bootstrapper } from '@/bootstrapper';
import { IApplication, IBootstrapper } from '@/common/types';
import { describe, expect, test } from 'bun:test';

describe('Bootstrapper Tests', () => {
  let application: IApplication;
  let bootstrapper: IBootstrapper;

  application = new TestApplication({ bootOptions: {} });
  bootstrapper = new Bootstrapper({ application, scope: Bootstrapper.name });

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
