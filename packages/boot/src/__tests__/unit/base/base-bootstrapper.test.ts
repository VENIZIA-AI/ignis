import { TestApplication } from '@/__tests__/fixtures/application';
import { BaseBootstrapper } from '@/base';
import { IBootableApplication, IBootstrapper } from '@/common/types';
import { describe, test } from 'bun:test';

describe('Base Bootstrapper Tests', () => {
  let application: IBootableApplication;
  let bootstrapper: IBootstrapper;
  const debug = true;

  application = new TestApplication({ bootOptions: { debug } });
  bootstrapper = new BaseBootstrapper({ application });

  describe('boot', () => {
    test('should run boot process and return report', async () => {
      await bootstrapper.boot({});
    });
  });
});
