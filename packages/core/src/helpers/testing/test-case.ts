import { AnyObject } from '@/common/types';
import { getError } from '@/helpers/error';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { TestCaseHandler } from './test-handler';
import { ITestCase } from './types';

export interface ITestCaseOptions<R extends object = {}, I extends object = {}> {
  code: string;
  name?: string;
  description: string;
  expectation?: string;

  handler: TestCaseHandler<R, I>;
}

export class TestCase<R extends object = {}, I extends object = {}> implements ITestCase<R, I> {
  code: string;
  name?: string;
  description: string;
  expectation?: string;

  handler: TestCaseHandler<R, I>;

  constructor(opts: ITestCaseOptions<R, I>) {
    const validateFields = ['code', 'description', 'expectation'];
    for (const key of validateFields) {
      const value = get(opts, key, null);

      if (value && !isEmpty(value)) {
        continue;
      }

      throw getError({
        message: `[TestCase] Invalid value for key: ${key} | value: ${value} | Opts: ${JSON.stringify(opts)}`,
      });
    }

    this.code = opts.code;

    this.name = opts.name;
    this.description = opts.description;
    this.expectation = opts.expectation;

    if (!this.description || isEmpty(this.description)) {
      throw getError({ message: `[TestCase][${this.code}] ` });
    }

    if (!this.description || isEmpty(this.description)) {
      throw getError({ message: `[TestCase][${this.code}] ` });
    }

    this.handler = opts.handler;
  }

  static withOptions<R extends object = AnyObject, I extends object = {}>(
    opts: ITestCaseOptions<R, I>,
  ) {
    return new TestCase(opts);
  }

  run() {
    return Promise.resolve(this.handler._execute());
  }
}
