import { float } from './parse.utility';

/**
 * Seconds from the process's high-resolution clock, to nine decimals - for measuring, not for dates.
 * A file of its own: `process.hrtime` is Node-only, and `performance.utility` ships on `/core`.
 */
export const hrTime = () => {
  const current = process.hrtime();
  return float(current[0] + current[1] / 10 ** 9, 9);
};
