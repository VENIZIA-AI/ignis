import { getError } from '@/helpers/error';
import { after, afterEach, before, beforeEach, describe } from 'node:test';
import { ApplicationLogger, LoggerFactory } from '../logger';
import { ITestPlan } from './types';

export class TestDescribe<R extends object> {
  testPlan: ITestPlan<R>;
  logger: ApplicationLogger;

  constructor(opts: { testPlan: ITestPlan<R> }) {
    this.testPlan = opts.testPlan;
    this.logger = LoggerFactory.getLogger([TestDescribe.name]);
  }

  static withTestPlan<R extends object>(opts: { testPlan: ITestPlan<R> }) {
    const testDescribe = new TestDescribe(opts);
    return testDescribe;
  }

  run() {
    if (!this.testPlan) {
      throw getError({ message: `[run] Invalid test plan!` });
    }

    const fn = () => {
      before(async () => {
        const hook = this.testPlan.getHook({ key: 'before' });
        await hook?.(this.testPlan);
      });

      beforeEach(async () => {
        const hook = this.testPlan.getHook({ key: 'beforeEach' });
        await hook?.(this.testPlan);
      });

      after(async () => {
        const hook = this.testPlan.getHook({ key: 'after' });
        await hook?.(this.testPlan);
      });

      afterEach(async () => {
        const hook = this.testPlan.getHook({ key: 'afterEach' });
        await hook?.(this.testPlan);
      });

      this.logger.info('[run][%s] START executing test plan!', this.testPlan.scope);
      this.testPlan.execute();
    };

    describe(this.testPlan.scope, fn);
  }
}

export class AppTestDescribe<R extends object> extends TestDescribe<R> {}
