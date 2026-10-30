import { ParseUtility } from './parse.utility';

export class HrTimeUtility {
  /**
   * Seconds from the process's high-resolution clock, to nine decimals - for measuring, not for dates.
   * A file of its own: `process.hrtime` is Node-only, and `performance.utility` ships on `/core`.
   */
  static getSeconds() {
    const current = process.hrtime();
    return ParseUtility.toFloat({ input: current[0] + current[1] / 10 ** 9, digit: 9 });
  }
}

/** @deprecated Use HrTimeUtility.getSeconds(). Removed in 0.5. */
export const hrTime = () => HrTimeUtility.getSeconds();
