import { TTestCaseDecision } from './types';

export class TestCaseDecisions {
  static readonly UNKNOWN: TTestCaseDecision = '000_UNKNOWN';
  static readonly FAIL: TTestCaseDecision = '000_FAIL';
  static readonly SUCCESS: TTestCaseDecision = '200_SUCCESS';
}
